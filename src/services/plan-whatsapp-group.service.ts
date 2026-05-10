import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { participants, plans } from '../db/schema.js'

export type LinkGroupResult =
  | { planId: string; groupId: string | null }
  | 'not_found'
  | 'forbidden'
  | 'conflict'

export async function setPlanWhatsappGroupId(
  db: Database,
  planId: string,
  userId: string,
  groupId: string | null
): Promise<LinkGroupResult> {
  const [plan] = await db
    .select({ planId: plans.planId })
    .from(plans)
    .where(eq(plans.planId, planId))
    .limit(1)

  if (!plan) return 'not_found'

  const [caller] = await db
    .select({ role: participants.role })
    .from(participants)
    .where(
      and(eq(participants.planId, planId), eq(participants.userId, userId))
    )
    .limit(1)

  if (!caller || caller.role !== 'owner') return 'forbidden'

  try {
    const [updated] = await db
      .update(plans)
      .set({ whatsappGroupId: groupId, updatedAt: new Date() })
      .where(eq(plans.planId, planId))
      .returning({
        planId: plans.planId,
        whatsappGroupId: plans.whatsappGroupId,
      })

    return { planId: updated.planId, groupId: updated.whatsappGroupId ?? null }
  } catch (err) {
    // PostgreSQL unique constraint violation (code 23505), possibly wrapped by Drizzle
    const pgCode =
      err != null && typeof err === 'object'
        ? ((err as { code?: string }).code ??
          (err as { cause?: { code?: string } }).cause?.code)
        : undefined
    if (pgCode === '23505') return 'conflict'
    throw err
  }
}

export async function getPlanByWhatsappGroupId(
  db: Database,
  groupId: string
): Promise<{ planId: string; title: string; startDate: Date | null } | null> {
  const [row] = await db
    .select({
      planId: plans.planId,
      title: plans.title,
      startDate: plans.startDate,
    })
    .from(plans)
    .where(eq(plans.whatsappGroupId, groupId))
    .limit(1)

  return row ?? null
}
