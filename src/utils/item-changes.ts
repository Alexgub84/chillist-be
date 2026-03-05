import type { Database } from '../db/index.js'
import { itemChanges } from '../db/schema.js'
import type { Item } from '../db/schema.js'

const TRACKED_FIELDS = [
  'name',
  'category',
  'quantity',
  'unit',
  'status',
  'subcategory',
  'notes',
] as const

export function computeItemDiff(
  existing: Pick<Item, (typeof TRACKED_FIELDS)[number]>,
  updates: Partial<Pick<Item, (typeof TRACKED_FIELDS)[number]>>
): Array<{ field: string; from: unknown; to: unknown }> {
  const result: Array<{ field: string; from: unknown; to: unknown }> = []
  for (const field of TRACKED_FIELDS) {
    const newVal = updates[field]
    if (newVal === undefined) continue
    const oldVal = existing[field]
    const oldJson = JSON.stringify(oldVal)
    const newJson = JSON.stringify(newVal)
    if (oldJson !== newJson) {
      result.push({ field, from: oldVal, to: newVal })
    }
  }
  return result
}

function toSerializable(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) {
      out[k] = v.toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

export async function recordItemCreated(
  db: Database,
  params: {
    itemId: string
    planId: string
    snapshot: Record<string, unknown>
    changedByUserId?: string | null
    changedByParticipantId?: string | null
  }
): Promise<void> {
  try {
    await db.insert(itemChanges).values({
      itemId: params.itemId,
      planId: params.planId,
      changeType: 'created',
      changes: { snapshot: toSerializable(params.snapshot) },
      changedByUserId: params.changedByUserId ?? null,
      changedByParticipantId: params.changedByParticipantId ?? null,
    })
  } catch (err) {
    console.error('[item-changes] Failed to record item created:', err)
  }
}

export async function recordItemUpdated(
  db: Database,
  params: {
    itemId: string
    planId: string
    existing: Pick<Item, (typeof TRACKED_FIELDS)[number]>
    updates: Partial<Pick<Item, (typeof TRACKED_FIELDS)[number]>>
    changedByUserId?: string | null
    changedByParticipantId?: string | null
  }
): Promise<void> {
  const diff = computeItemDiff(params.existing, params.updates)
  if (diff.length === 0) return
  try {
    await db.insert(itemChanges).values({
      itemId: params.itemId,
      planId: params.planId,
      changeType: 'updated',
      changes: {
        fields: diff.map((d) => ({
          field: d.field,
          from: d.from,
          to: d.to,
        })),
      },
      changedByUserId: params.changedByUserId ?? null,
      changedByParticipantId: params.changedByParticipantId ?? null,
    })
  } catch (err) {
    console.error('[item-changes] Failed to record item updated:', err)
  }
}
