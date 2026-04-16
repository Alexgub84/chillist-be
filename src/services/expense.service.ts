import { eq, and, inArray } from 'drizzle-orm'
import { items } from '../db/schema.js'
import type { Database } from '../db/index.js'

type TransactionClient = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function validateItemIds(
  db: Database,
  itemIds: string[],
  planId: string
): Promise<string | null> {
  if (itemIds.length === 0) return null

  const uniqueIds = [...new Set(itemIds)]
  const found = await db
    .select({ itemId: items.itemId })
    .from(items)
    .where(and(inArray(items.itemId, uniqueIds), eq(items.planId, planId)))

  if (found.length !== uniqueIds.length) {
    const foundIds = new Set(found.map((r) => r.itemId))
    const missing = uniqueIds.filter((id) => !foundIds.has(id))
    return `Items not found in this plan: ${missing.join(', ')}`
  }

  return null
}

export async function advanceItemStatusOnExpense(
  db: Database | TransactionClient,
  itemIds: string[],
  planId: string,
  participantId: string
): Promise<void> {
  if (itemIds.length === 0) return

  const linkedItems = await db
    .select()
    .from(items)
    .where(and(inArray(items.itemId, itemIds), eq(items.planId, planId)))

  for (const item of linkedItems) {
    const updatedList = item.assignmentStatusList.map((entry) =>
      entry.participantId === participantId && entry.status === 'pending'
        ? { ...entry, status: 'purchased' as const }
        : entry
    )

    const changed =
      JSON.stringify(updatedList) !== JSON.stringify(item.assignmentStatusList)

    if (changed) {
      await db
        .update(items)
        .set({ assignmentStatusList: updatedList, updatedAt: new Date() })
        .where(eq(items.itemId, item.itemId))
    }
  }
}
