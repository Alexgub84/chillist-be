import { eq, and, ne } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { Database } from '../db/index.js'
import { items, participants, Item, ItemCategory, Unit } from '../db/schema.js'

export class NotOwnerError extends Error {
  constructor() {
    super('Only the plan owner can assign items to all participants')
    this.name = 'NotOwnerError'
  }
}

export class ItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Item not found: ${itemId}`)
    this.name = 'ItemNotFoundError'
  }
}

export class NoGroupError extends Error {
  constructor(itemId: string) {
    super(`Item is not part of an all-participants group: ${itemId}`)
    this.name = 'NoGroupError'
  }
}

interface CoreFieldUpdates {
  name?: string
  quantity?: number
  unit?: Unit
  category?: ItemCategory
  subcategory?: string | null
  notes?: string | null
}

const CORE_FIELD_KEYS: (keyof CoreFieldUpdates)[] = [
  'name',
  'quantity',
  'unit',
  'category',
  'subcategory',
  'notes',
]

function pickCoreFields(
  updates: Record<string, unknown>
): CoreFieldUpdates | null {
  const picked: Record<string, unknown> = {}
  let hasFields = false
  for (const key of CORE_FIELD_KEYS) {
    if (key in updates) {
      picked[key] = updates[key]
      hasFields = true
    }
  }
  return hasFields ? (picked as CoreFieldUpdates) : null
}

export async function assignItemToAllParticipants(
  db: Database,
  itemId: string,
  ownerParticipantId: string
): Promise<Item[]> {
  return await db.transaction(async (tx) => {
    const [item] = await tx.select().from(items).where(eq(items.itemId, itemId))

    if (!item) throw new ItemNotFoundError(itemId)

    const [owner] = await tx
      .select({
        participantId: participants.participantId,
        role: participants.role,
        planId: participants.planId,
      })
      .from(participants)
      .where(eq(participants.participantId, ownerParticipantId))

    if (!owner || owner.role !== 'owner') throw new NotOwnerError()

    const allParticipants = await tx
      .select({
        participantId: participants.participantId,
      })
      .from(participants)
      .where(eq(participants.planId, item.planId))

    if (item.allParticipantsGroupId) {
      return await reconcileGroup(
        tx,
        item.allParticipantsGroupId,
        item.planId,
        allParticipants.map((p) => p.participantId)
      )
    }

    const groupId = randomUUID()
    const now = new Date()

    await tx
      .update(items)
      .set({
        isAllParticipants: true,
        allParticipantsGroupId: groupId,
        assignedParticipantId: ownerParticipantId,
        updatedAt: now,
      })
      .where(eq(items.itemId, itemId))

    const otherParticipants = allParticipants.filter(
      (p) => p.participantId !== ownerParticipantId
    )

    if (otherParticipants.length > 0) {
      await tx.insert(items).values(
        otherParticipants.map((p) => ({
          planId: item.planId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          status: 'pending' as const,
          subcategory: item.subcategory,
          notes: item.notes,
          assignedParticipantId: p.participantId,
          isAllParticipants: true,
          allParticipantsGroupId: groupId,
        }))
      )
    }

    return await tx
      .select()
      .from(items)
      .where(eq(items.allParticipantsGroupId, groupId))
  })
}

async function reconcileGroup(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  groupId: string,
  planId: string,
  currentParticipantIds: string[]
): Promise<Item[]> {
  const groupItems = await tx
    .select()
    .from(items)
    .where(eq(items.allParticipantsGroupId, groupId))

  const existingByParticipant = new Map<string, Item>()
  for (const gi of groupItems) {
    if (gi.assignedParticipantId) {
      existingByParticipant.set(gi.assignedParticipantId, gi)
    }
  }

  const template = groupItems[0]
  const now = new Date()

  for (const pid of currentParticipantIds) {
    const existing = existingByParticipant.get(pid)
    if (existing) {
      if (existing.status === 'canceled') {
        await tx
          .update(items)
          .set({
            status: 'pending',
            isAllParticipants: true,
            updatedAt: now,
          })
          .where(eq(items.itemId, existing.itemId))
      } else if (!existing.isAllParticipants) {
        await tx
          .update(items)
          .set({ isAllParticipants: true, updatedAt: now })
          .where(eq(items.itemId, existing.itemId))
      }
    } else {
      await tx.insert(items).values({
        planId,
        name: template.name,
        category: template.category,
        quantity: template.quantity,
        unit: template.unit,
        status: 'pending',
        subcategory: template.subcategory,
        notes: template.notes,
        assignedParticipantId: pid,
        isAllParticipants: true,
        allParticipantsGroupId: groupId,
      })
    }
  }

  return await tx
    .select()
    .from(items)
    .where(
      and(
        eq(items.allParticipantsGroupId, groupId),
        eq(items.isAllParticipants, true),
        ne(items.status, 'canceled')
      )
    )
}

export async function reassignGroupToParticipant(
  db: Database,
  itemId: string,
  newAssignedParticipantId: string
): Promise<Item> {
  return await db.transaction(async (tx) => {
    const [item] = await tx.select().from(items).where(eq(items.itemId, itemId))

    if (!item) throw new ItemNotFoundError(itemId)
    if (!item.allParticipantsGroupId) throw new NoGroupError(itemId)

    const now = new Date()

    await tx
      .update(items)
      .set({
        status: 'canceled',
        isAllParticipants: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(items.allParticipantsGroupId, item.allParticipantsGroupId),
          ne(items.itemId, itemId)
        )
      )

    const [updated] = await tx
      .update(items)
      .set({
        isAllParticipants: false,
        assignedParticipantId: newAssignedParticipantId,
        updatedAt: now,
      })
      .where(eq(items.itemId, itemId))
      .returning()

    return updated
  })
}

export async function unassignGroup(
  db: Database,
  itemId: string
): Promise<number> {
  return await db.transaction(async (tx) => {
    const [item] = await tx.select().from(items).where(eq(items.itemId, itemId))

    if (!item) throw new ItemNotFoundError(itemId)
    if (!item.allParticipantsGroupId) throw new NoGroupError(itemId)

    const result = await tx
      .update(items)
      .set({
        status: 'canceled',
        isAllParticipants: false,
        updatedAt: new Date(),
      })
      .where(eq(items.allParticipantsGroupId, item.allParticipantsGroupId))
      .returning({ itemId: items.itemId })

    return result.length
  })
}

export async function updateGroupCoreFields(
  db: Database,
  itemId: string,
  updates: Record<string, unknown>
): Promise<number> {
  const coreFields = pickCoreFields(updates)
  if (!coreFields) return 0

  return await db.transaction(async (tx) => {
    const [item] = await tx.select().from(items).where(eq(items.itemId, itemId))

    if (!item) throw new ItemNotFoundError(itemId)
    if (!item.isAllParticipants || !item.allParticipantsGroupId) return 0

    const result = await tx
      .update(items)
      .set({ ...coreFields, updatedAt: new Date() })
      .where(eq(items.allParticipantsGroupId, item.allParticipantsGroupId))
      .returning({ itemId: items.itemId })

    return result.length
  })
}

export async function createItemsForNewParticipant(
  db: Database,
  planId: string,
  participantId: string
): Promise<Item[]> {
  return await db.transaction(async (tx) => {
    const templates = await tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.planId, planId),
          eq(items.isAllParticipants, true),
          ne(items.status, 'canceled')
        )
      )

    const groupsSeen = new Set<string>()
    const uniqueTemplates: Item[] = []
    for (const t of templates) {
      if (
        t.allParticipantsGroupId &&
        !groupsSeen.has(t.allParticipantsGroupId)
      ) {
        groupsSeen.add(t.allParticipantsGroupId)
        uniqueTemplates.push(t)
      }
    }

    if (uniqueTemplates.length === 0) return []

    const existingCopies = await tx
      .select({ allParticipantsGroupId: items.allParticipantsGroupId })
      .from(items)
      .where(
        and(
          eq(items.assignedParticipantId, participantId),
          eq(items.planId, planId),
          eq(items.isAllParticipants, true)
        )
      )

    const existingGroups = new Set(
      existingCopies
        .map((c) => c.allParticipantsGroupId)
        .filter((id): id is string => !!id)
    )

    const toInsert = uniqueTemplates.filter(
      (t) => !existingGroups.has(t.allParticipantsGroupId!)
    )

    if (toInsert.length === 0) return []

    return await tx
      .insert(items)
      .values(
        toInsert.map((t) => ({
          planId,
          name: t.name,
          category: t.category,
          quantity: t.quantity,
          unit: t.unit,
          status: 'pending' as const,
          subcategory: t.subcategory,
          notes: t.notes,
          assignedParticipantId: participantId,
          isAllParticipants: true,
          allParticipantsGroupId: t.allParticipantsGroupId,
        }))
      )
      .returning()
  })
}

export async function removeParticipantFromAllGroups(
  db: Database,
  participantId: string
): Promise<number> {
  const result = await db
    .delete(items)
    .where(
      and(
        eq(items.assignedParticipantId, participantId),
        eq(items.isAllParticipants, true)
      )
    )
    .returning({ itemId: items.itemId })

  return result.length
}
