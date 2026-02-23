import { eq, and } from 'drizzle-orm'
import type { JwtUser } from '../plugins/auth.js'
import { plans, participants, Plan } from '../db/schema.js'
import { Database } from '../db/index.js'
import { isAdmin } from './admin.js'

export interface PlanAccessResult {
  allowed: boolean
  plan: Plan | null
}

export async function checkPlanAccess(
  db: Database,
  planId: string,
  user: JwtUser | null | undefined
): Promise<PlanAccessResult> {
  const [plan] = await db.select().from(plans).where(eq(plans.planId, planId))

  if (!plan) {
    return { allowed: false, plan: null }
  }

  if (isAdmin(user)) {
    return { allowed: true, plan }
  }

  if (plan.visibility === 'public') {
    return { allowed: true, plan }
  }

  const userId = user?.id
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
