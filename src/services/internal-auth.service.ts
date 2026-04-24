import { desc, eq } from 'drizzle-orm'
import { users, participants, plans } from '../db/schema.js'
import { Database } from '../db/index.js'
import { normalizePhone } from '../utils/phone.js'
import {
  fetchSupabaseUserMetadata,
  fetchSupabaseUserMetadataFields,
} from '../utils/supabase-admin.js'

const E164_PATTERN = /^\+[1-9]\d{6,14}$/

function pickE164Phone(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const c of candidates) {
    if (!c) continue
    try {
      const n = normalizePhone(String(c))
      if (E164_PATTERN.test(n)) return n
    } catch {
      continue
    }
  }
  return null
}

export interface IdentifiedUser {
  userId: string
  displayName: string
}

export interface AmbiguousPhoneLookup {
  ambiguous: true
  userIds: string[]
}

export type ResolveUserByPhoneResult =
  | IdentifiedUser
  | null
  | AmbiguousPhoneLookup

export function isAmbiguousPhoneLookup(
  r: ResolveUserByPhoneResult
): r is AmbiguousPhoneLookup {
  return r !== null && typeof r === 'object' && 'ambiguous' in r && r.ambiguous
}

export interface ResolvedInternalPlanOwner {
  name: string
  lastName: string
  contactPhone: string
  displayName?: string
}

interface MinimalLogger {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
}

export async function resolveOwnerForInternalPlan(
  db: Database,
  userId: string,
  log?: MinimalLogger
): Promise<ResolvedInternalPlanOwner | null> {
  const [userRow] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1)

  const supabaseFields = await fetchSupabaseUserMetadataFields(userId, log)

  const [latestParticipant] = await db
    .select({
      name: participants.name,
      lastName: participants.lastName,
      displayName: participants.displayName,
      contactPhone: participants.contactPhone,
    })
    .from(participants)
    .innerJoin(plans, eq(participants.planId, plans.planId))
    .where(eq(participants.userId, userId))
    .orderBy(desc(plans.createdAt))
    .limit(1)

  const contactPhone = pickE164Phone(
    userRow?.phone,
    supabaseFields?.phoneFromMeta,
    latestParticipant?.contactPhone
  )

  if (!contactPhone) {
    log?.warn({ userId }, 'Internal plan create — no E.164 phone for owner')
    return null
  }

  let name: string
  let lastName: string
  if (supabaseFields?.firstName) {
    name = supabaseFields.firstName
    lastName = supabaseFields.lastName ?? ''
  } else if (latestParticipant) {
    name = latestParticipant.name
    lastName = latestParticipant.lastName
  } else {
    name = 'Guest'
    lastName = 'User'
  }

  if (!name.trim()) {
    name = 'Guest'
  }
  if (!lastName.trim()) {
    lastName = '-'
  }

  const displayName =
    latestParticipant?.displayName?.trim() ||
    (supabaseFields?.firstName
      ? supabaseFields.lastName
        ? `${supabaseFields.firstName} ${supabaseFields.lastName}`.trim()
        : supabaseFields.firstName
      : undefined)

  log?.info({ userId }, 'Internal plan owner resolved')

  return {
    name: name.trim(),
    lastName: lastName.trim(),
    contactPhone,
    ...(displayName && { displayName }),
  }
}

export async function resolveUserByPhone(
  db: Database,
  phone: string,
  log?: MinimalLogger
): Promise<ResolveUserByPhoneResult> {
  const normalized = normalizePhone(phone)
  const phonePrefix = normalized.slice(0, 4) + '***'

  log?.info({ phonePrefix }, 'Normalized phone for DB lookup')

  const rows = await db
    .select({ userId: users.userId })
    .from(users)
    .where(eq(users.phone, normalized))

  if (rows.length === 0) {
    log?.info({ phonePrefix }, 'No user row found for phone')
    return null
  }

  if (rows.length > 1) {
    const userIds = rows.map((r) => r.userId).sort()
    log?.warn(
      { phonePrefix, userIds },
      'Multiple users share canonical phone — identify refused'
    )
    return { ambiguous: true, userIds }
  }

  const row = rows[0]!
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
