import { eq, and, inArray } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { items, plans, participants } from '../db/schema.js'
import type { Item, ItemCategory, Unit, ItemStatus } from '../db/schema.js'
import {
  assignItemToAllParticipants,
  reassignGroupToParticipant,
  unassignGroup,
  updateGroupCoreFields,
} from './all-participants-items.service.js'

export interface ValidationResult {
  valid: boolean
  message?: string
}

export interface ItemUpdateResult {
  item: Item
  handled: true
}

export interface UpdateItemFields {
  name?: string
  category?: ItemCategory
  quantity?: number
  unit?: Unit
  status?: ItemStatus
  subcategory?: string | null
  notes?: string | null
  assignedParticipantId?: string | null
}

export async function checkPlanExists(
  db: Database,
  planId: string
): Promise<boolean> {
  const [existing] = await db
    .select({ planId: plans.planId })
    .from(plans)
    .where(eq(plans.planId, planId))
  return !!existing
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

export async function findPlanOwner(
  db: Database,
  planId: string
): Promise<string | null> {
  const [owner] = await db
    .select({ participantId: participants.participantId })
    .from(participants)
    .where(and(eq(participants.planId, planId), eq(participants.role, 'owner')))
  return owner?.participantId ?? null
}

export async function applyAllParticipantsUpdate(
  db: Database,
  itemId: string,
  existing: Item,
  assignedToAll: boolean | undefined,
  fieldUpdates: UpdateItemFields,
  participantValidator: (pid: string) => Promise<ValidationResult>
): Promise<ItemUpdateResult | null> {
  if (assignedToAll === true) {
    const ownerPid = await findPlanOwner(db, existing.planId)
    if (!ownerPid) {
      throw new Error('Plan has no owner participant')
    }

    const group = await assignItemToAllParticipants(db, itemId, ownerPid)
    const updated = group.find((g) => g.itemId === itemId) ?? group[0]
    return { item: updated, handled: true }
  }

  if (!existing.isAllParticipants || !existing.allParticipantsGroupId) {
    return null
  }

  if (
    fieldUpdates.assignedParticipantId !== undefined &&
    fieldUpdates.assignedParticipantId !== null
  ) {
    const check = await participantValidator(fieldUpdates.assignedParticipantId)
    if (!check.valid) {
      throw new Error(check.message ?? 'Participant not found')
    }

    const result = await reassignGroupToParticipant(
      db,
      itemId,
      fieldUpdates.assignedParticipantId
    )
    return { item: result, handled: true }
  }

  if (fieldUpdates.assignedParticipantId === null || assignedToAll === false) {
    await unassignGroup(db, itemId)
    const [updated] = await db
      .select()
      .from(items)
      .where(eq(items.itemId, itemId))
    return { item: updated, handled: true }
  }

  if (Object.keys(fieldUpdates).length > 0) {
    await updateGroupCoreFields(
      db,
      itemId,
      fieldUpdates as Record<string, unknown>
    )
  }

  if (fieldUpdates.status) {
    await db
      .update(items)
      .set({ status: fieldUpdates.status, updatedAt: new Date() })
      .where(eq(items.itemId, itemId))
  }

  const [refreshed] = await db
    .select()
    .from(items)
    .where(eq(items.itemId, itemId))
  return { item: refreshed, handled: true }
}

export async function createItemAssignedToAll(
  db: Database,
  createdItemId: string,
  planId: string
): Promise<Item[] | null> {
  const ownerPid = await findPlanOwner(db, planId)
  if (!ownerPid) return null

  return await assignItemToAllParticipants(db, createdItemId, ownerPid)
}
