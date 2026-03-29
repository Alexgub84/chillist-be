import { eq } from 'drizzle-orm'
import { users, participants } from '../db/schema.js'
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
    .select({ userId: users.userId })
    .from(users)
    .where(eq(users.phone, normalized))
    .limit(1)

  if (!row) {
    log?.info({ phonePrefix }, 'No user row found for phone')
    return null
  }

  log?.info({ phonePrefix, userId: row.userId }, 'User found in DB')

  const supabaseMeta = await fetchSupabaseUserMetadata(row.userId, log)

  if (supabaseMeta?.displayName) {
    log?.info(
      { phonePrefix, userId: row.userId },
      'Display name resolved from Supabase'
    )
    return { userId: row.userId, displayName: supabaseMeta.displayName }
  }

  const [participant] = await db
    .select({
      name: participants.name,
      lastName: participants.lastName,
      displayName: participants.displayName,
    })
    .from(participants)
    .where(eq(participants.userId, row.userId))
    .limit(1)

  if (!participant) {
    log?.warn(
      { phonePrefix, userId: row.userId },
      'No display name available — Supabase and participants both empty'
    )
    return null
  }

  const displayName =
    participant.displayName ||
    `${participant.name} ${participant.lastName}`.trim()
  const displayNameSource = participant.displayName
    ? 'participant.displayName'
    : 'participant.name+lastName'

  log?.info(
    { phonePrefix, userId: row.userId, displayNameSource },
    'Display name resolved from participant fallback'
  )

  return { userId: row.userId, displayName }
}
