import { eq, and } from 'drizzle-orm'
import { plans, participants, Plan } from '../db/schema.js'
import { Database } from '../db/index.js'

export interface PlanAccessResult {
  allowed: boolean
  plan: Plan | null
}

export async function checkPlanAccess(
  db: Database,
  planId: string,
  userId: string | undefined
): Promise<PlanAccessResult> {
  const [plan] = await db.select().from(plans).where(eq(plans.planId, planId))

  if (!plan) {
    return { allowed: false, plan: null }
  }

  if (plan.visibility === 'public') {
    return { allowed: true, plan }
  }

  if (!userId) {
    return { allowed: false, plan: null }
  }

  if (plan.createdByUserId === userId) {
    return { allowed: true, plan }
  }

  const [linked] = await db
    .select({ participantId: participants.participantId })
    .from(participants)
    .where(
      and(eq(participants.planId, planId), eq(participants.userId, userId))
    )
    .limit(1)

  if (linked) {
    return { allowed: true, plan }
  }

  return { allowed: false, plan: null }
}
