import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { participants, plans } from '../db/schema.js'
import { Database } from '../db/index.js'
import { normalizePhone } from '../utils/phone.js'
import { fetchSupabaseUserMetadata } from '../utils/supabase-admin.js'

export interface IdentifiedUser {
  userId: string
  displayName: string
}

export async function resolveUserByPhone(
  db: Database,
  phone: string
): Promise<IdentifiedUser | null> {
  const normalized = normalizePhone(phone)

  const [row] = await db
    .select({
      userId: participants.userId,
      name: participants.name,
      lastName: participants.lastName,
      displayName: participants.displayName,
    })
    .from(participants)
    .innerJoin(plans, eq(participants.planId, plans.planId))
    .where(
      and(
        eq(participants.contactPhone, normalized),
        isNotNull(participants.userId)
      )
    )
    .orderBy(desc(plans.createdAt))
    .limit(1)

  if (!row?.userId) return null

  const supabaseMeta = await fetchSupabaseUserMetadata(row.userId)

  const displayName =
    supabaseMeta?.displayName ??
    row.displayName ??
    `${row.name} ${row.lastName}`.trim()

  return { userId: row.userId, displayName }
}
