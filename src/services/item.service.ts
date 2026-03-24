import { eq, and, inArray } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { items, participants } from '../db/schema.js'
import type { Item, Assignment, Unit } from '../db/schema.js'
import type { JwtUser } from '../plugins/auth.js'
import { recordItemCreated, recordItemUpdated } from '../utils/item-changes.js'
import { resolveItemUnitForUpdate } from '../utils/item-helpers.js'
import {
  prepareItemForCreate,
  splitUpdatePayload,
  computeFinalAssignmentState,
  validateNonOwnerAssignmentChange,
  type CreateItemInput,
} from '../utils/item-mutation.js'
import { filterAssignmentForParticipant } from '../utils/assignment-helpers.js'

export interface ValidationResult {
  valid: boolean
  message?: string
}

export interface MutationAccessResult {
  allowed: boolean
  participant: { participantId: string; role: string } | null
}

export async function checkPlanExists(
  db: Database,
  planId: string
): Promise<boolean> {
  const [existing] = await db
    .select({ planId: items.planId })
    .from(items)
    .where(eq(items.planId, planId))
    .limit(1)
  return !!existing
}

export async function checkItemMutationAccess(
  db: Database,
  planId: string,
  user: JwtUser | null | undefined
): Promise<MutationAccessResult> {
  if (!user) return { allowed: false, participant: null }

  const [p] = await db
    .select({
      participantId: participants.participantId,
      role: participants.role,
    })
    .from(participants)
    .where(
      and(eq(participants.planId, planId), eq(participants.userId, user.id))
    )
    .limit(1)

  if (!p || p.role === 'viewer') return { allowed: false, participant: null }

  return { allowed: true, participant: p }
}

export function canEditItem(
  access: MutationAccessResult,
  existingItem: Item
): boolean {
  if (!access.allowed || !access.participant) {
    return access.allowed
  }
  if (access.participant.role === 'owner') return true

  const isAssigned = existingItem.assignmentStatusList.some(
    (a: Assignment) => a.participantId === access.participant!.participantId
  )
  if (isAssigned) return true

  if (existingItem.assignmentStatusList.length === 0) return true

  return false
}

export async function validateParticipant(
  db: Database,
  participantId: string,
  planId: string
): Promise<ValidationResult> {
  const [p] = await db
    .select({
      participantId: participants.participantId,
      planId: participants.planId,
    })
    .from(participants)
    .where(eq(participants.participantId, participantId))

  if (!p) return { valid: false, message: 'Participant not found' }
  if (p.planId !== planId)
    return {
      valid: false,
      message: 'Participant does not belong to this plan',
    }
  return { valid: true }
}

export async function batchValidateParticipants(
  db: Database,
  participantIds: string[]
): Promise<Map<string, string>> {
  if (participantIds.length === 0) return new Map()

  const found = await db
    .select({
      participantId: participants.participantId,
      planId: participants.planId,
    })
    .from(participants)
    .where(inArray(participants.participantId, participantIds))

  const map = new Map<string, string>()
  for (const p of found) {
    map.set(p.participantId, p.planId)
  }
  return map
}

export async function getPlanParticipantIds(
  db: Database,
  planId: string
): Promise<string[]> {
  const rows = await db
    .select({ participantId: participants.participantId })
    .from(participants)
    .where(eq(participants.planId, planId))
  return rows.map((r) => r.participantId)
}

export async function persistAssignments(
  db: Database,
  itemId: string,
  assignmentStatusList: Assignment[],
  isAllParticipants: boolean
): Promise<Item> {
  const [updated] = await db
    .update(items)
    .set({
      assignmentStatusList,
      isAllParticipants,
      updatedAt: new Date(),
    })
    .where(eq(items.itemId, itemId))
    .returning()
  return updated
}

export async function removeParticipantFromAssignments(
  db: Database,
  planId: string,
  participantId: string
): Promise<number> {
  const planItems = await db
    .select({
      itemId: items.itemId,
      assignmentStatusList: items.assignmentStatusList,
    })
    .from(items)
    .where(eq(items.planId, planId))

  let updatedCount = 0
  for (const item of planItems) {
    const list = item.assignmentStatusList as Assignment[]
    const hasParticipant = list.some((a) => a.participantId === participantId)
    if (!hasParticipant) continue

    const filtered = list.filter((a) => a.participantId !== participantId)
    await db
      .update(items)
      .set({ assignmentStatusList: filtered, updatedAt: new Date() })
      .where(eq(items.itemId, item.itemId))
    updatedCount++
  }
  return updatedCount
}

export async function addParticipantToAllFlaggedItems(
  db: Database,
  planId: string,
  participantId: string
): Promise<number> {
  const flaggedItems = await db
    .select({
      itemId: items.itemId,
      assignmentStatusList: items.assignmentStatusList,
    })
    .from(items)
    .where(and(eq(items.planId, planId), eq(items.isAllParticipants, true)))

  let updatedCount = 0
  for (const item of flaggedItems) {
    const list = item.assignmentStatusList as Assignment[]
    if (list.some((a) => a.participantId === participantId)) continue

    const updated = [...list, { participantId, status: 'pending' as const }]
    await db
      .update(items)
      .set({ assignmentStatusList: updated, updatedAt: new Date() })
      .where(eq(items.itemId, item.itemId))
    updatedCount++
  }
  return updatedCount
}

export interface BulkItemError {
  name: string
  message: string
}

export async function createPlanItems(
  db: Database,
  options: {
    planId: string
    inputs: CreateItemInput[]
    isOwner: boolean
    changedBy: { userId?: string | null; participantId?: string | null }
  }
): Promise<{ items: Item[]; errors: BulkItemError[] }> {
  const { planId, inputs, isOwner, changedBy } = options
  const participantIds = await getPlanParticipantIds(db, planId)
  const validValues: Array<{
    planId: string
    name: string
    category: Item['category']
    quantity: number
    unit: Item['unit']
    subcategory?: string | null
    notes?: string | null
    assignmentStatusList: Assignment[]
    isAllParticipants: boolean
  }> = []
  const errors: BulkItemError[] = []

  for (const input of inputs) {
    const prepared = prepareItemForCreate(input, isOwner, participantIds)
    if ('error' in prepared) {
      errors.push({ name: input.name, message: prepared.error })
      continue
    }
    validValues.push({ planId, ...prepared.values })
  }

  let createdItems: Item[] = []
  if (validValues.length > 0) {
    createdItems = await db.insert(items).values(validValues).returning()
  }
  for (const created of createdItems) {
    recordItemCreated(db, {
      itemId: created.itemId,
      planId,
      snapshot: created as unknown as Record<string, unknown>,
      changedByUserId: changedBy.userId ?? null,
      changedByParticipantId: changedBy.participantId ?? null,
    })
  }
  return { items: createdItems, errors }
}

export type ProcessItemUpdateBody = {
  assignmentStatusList?: Assignment[]
  isAllParticipants?: boolean
  unassign?: boolean
  name?: string
  category?: string
  quantity?: number
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
}

export type ProcessItemUpdateResult =
  | { ok: true; item: Item }
  | { ok: false; status: 400 | 403 | 404; message: string }

export async function processItemUpdate(
  db: Database,
  args: {
    existingItem: Item
    body: ProcessItemUpdateBody
    access: MutationAccessResult
    isOwner: boolean
    guestParticipantId: string | null
    changedByUserId: string | null
    changedByParticipantId: string | null
  }
): Promise<ProcessItemUpdateResult> {
  const {
    existingItem,
    body,
    access,
    isOwner,
    guestParticipantId,
    changedByUserId,
    changedByParticipantId,
  } = args
  const itemId = existingItem.itemId

  const split = splitUpdatePayload(body)
  if ('error' in split) {
    return { ok: false, status: 400, message: split.error }
  }

  if (guestParticipantId) {
    const guestAccess: MutationAccessResult = {
      allowed: true,
      participant: { participantId: guestParticipantId, role: 'participant' },
    }
    if (!canEditItem(guestAccess, existingItem)) {
      return {
        ok: false,
        status: 403,
        message: 'You can only edit items assigned to you',
      }
    }
  } else if (!canEditItem(access, existingItem)) {
    return { ok: false, status: 404, message: 'Item not found' }
  }

  const participantIdForMerge =
    access.participant?.participantId ?? guestParticipantId!
  if (split.hasAssignmentFields && !isOwner && !split.unassign) {
    const v = validateNonOwnerAssignmentChange(
      split.bodyAssignments,
      split.bodyIsAll,
      existingItem.isAllParticipants,
      participantIdForMerge
    )
    if ('error' in v) {
      return { ok: false, status: 400, message: v.error }
    }
  }

  const fieldUpdates = { ...split.fieldUpdates }
  const unitResult = resolveItemUnitForUpdate(
    existingItem.category,
    existingItem.unit,
    fieldUpdates
  )
  if (unitResult && 'error' in unitResult) {
    return { ok: false, status: 400, message: unitResult.error }
  }
  if (unitResult) {
    fieldUpdates.unit = unitResult.unit
  }

  let finalItem: Item = existingItem

  if (Object.keys(fieldUpdates).length > 0) {
    const [updated] = await db
      .update(items)
      .set({ ...fieldUpdates, updatedAt: new Date() })
      .where(eq(items.itemId, itemId))
      .returning()
    finalItem = updated
  }

  if (split.hasAssignmentFields) {
    const { finalList, finalIsAll } = computeFinalAssignmentState(
      existingItem,
      split.bodyAssignments,
      split.bodyIsAll,
      split.unassign,
      isOwner,
      participantIdForMerge
    )
    finalItem = await persistAssignments(db, itemId, finalList, finalIsAll)
  }

  if (!isOwner && (access.participant || guestParticipantId)) {
    const pid = access.participant?.participantId ?? guestParticipantId!
    finalItem = {
      ...finalItem,
      assignmentStatusList: filterAssignmentForParticipant(
        finalItem.assignmentStatusList as Assignment[],
        pid
      ),
    }
  }

  recordItemUpdated(db, {
    itemId,
    planId: existingItem.planId,
    existing: existingItem,
    updates: fieldUpdates,
    changedByUserId,
    changedByParticipantId,
  })

  return { ok: true, item: finalItem }
}
