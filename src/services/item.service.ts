import { eq, and, inArray } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { items, participants } from '../db/schema.js'
import type { Item, Assignment } from '../db/schema.js'
import type { JwtUser } from '../plugins/auth.js'

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
