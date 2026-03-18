import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { participants, plans } from '../db/schema.js'
import { Database } from '../db/index.js'
import { normalizePhone } from '../utils/phone.js'
import { fetchSupabaseUserMetadata } from '../utils/supabase-admin.js'

export interface IdentifiedUser {
  userId: string
  displayName: string
}

interface MinimalLogger {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
}

export async function resolveUserByPhone(
  db: Database,
  phone: string,
  log?: MinimalLogger
): Promise<IdentifiedUser | null> {
  const normalized = normalizePhone(phone)
  const phonePrefix = normalized.slice(0, 4) + '***'

  log?.info({ phonePrefix }, 'Normalized phone for DB lookup')

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

  if (!row) {
    log?.info({ phonePrefix }, 'No participant row found for phone')
    return null
  }

  if (!row.userId) {
    log?.warn(
      { phonePrefix },
      'Participant row found but userId is null — phone not linked to a registered account'
    )
    return null
  }

  log?.info({ phonePrefix, userId: row.userId }, 'Participant found in DB')

  const supabaseMeta = await fetchSupabaseUserMetadata(row.userId, log)

  let displayNameSource: string
  let displayName: string
  if (supabaseMeta?.displayName) {
    displayName = supabaseMeta.displayName
    displayNameSource = 'supabase'
  } else if (row.displayName) {
    displayName = row.displayName
    displayNameSource = 'participant.displayName'
  } else {
    displayName = `${row.name} ${row.lastName}`.trim()
    displayNameSource = 'participant.name+lastName'
  }

  log?.info(
    { phonePrefix, userId: row.userId, displayNameSource },
    'Display name resolved'
  )

  return { userId: row.userId, displayName }
}
