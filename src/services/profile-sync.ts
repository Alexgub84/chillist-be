import { eq, and, inArray } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import type { JwtUser } from '../plugins/auth.js'
import type { Database } from '../db/index.js'
import { participants, Participant } from '../db/schema.js'

export function buildIdentityFields(user: JwtUser): Record<string, unknown> {
  const fields: Record<string, unknown> = {}

  if (user.firstName) fields.name = user.firstName
  if (user.lastName) fields.lastName = user.lastName
  if (user.email) fields.contactEmail = user.email
  if (user.phone) fields.contactPhone = user.phone
  if (user.avatarUrl) fields.avatarUrl = user.avatarUrl

  return fields
}

function needsSync(
  participant: Participant,
  identityFields: Record<string, unknown>
): boolean {
  const fieldMap: Record<string, keyof Participant> = {
    name: 'name',
    lastName: 'lastName',
    contactEmail: 'contactEmail',
    contactPhone: 'contactPhone',
    avatarUrl: 'avatarUrl',
  }

  for (const [updateKey, participantKey] of Object.entries(fieldMap)) {
    if (
      updateKey in identityFields &&
      identityFields[updateKey] !== participant[participantKey]
    ) {
      return true
    }
  }

  return false
}

export async function syncAllParticipantsForUser(
  db: Database,
  user: JwtUser,
  log?: FastifyBaseLogger
): Promise<number> {
  const identityFields = buildIdentityFields(user)
  if (Object.keys(identityFields).length === 0) return 0

  const userParticipants = await db
    .select()
    .from(participants)
    .where(eq(participants.userId, user.id))

  const stale = userParticipants.filter((p) => needsSync(p, identityFields))

  if (stale.length === 0) return 0

  const staleIds = stale.map((p) => p.participantId)
  await db
    .update(participants)
    .set({ ...identityFields, updatedAt: new Date() })
    .where(inArray(participants.participantId, staleIds))

  log?.info(
    { userId: user.id, syncedCount: stale.length },
    'Participant identity synced across all plans'
  )

  return stale.length
}

export async function syncParticipantFromJwt(
  db: Database,
  planId: string,
  user: JwtUser,
  log?: FastifyBaseLogger
): Promise<Participant | null> {
  const [participant] = await db
    .select()
    .from(participants)
    .where(
      and(eq(participants.planId, planId), eq(participants.userId, user.id))
    )
    .limit(1)

  if (!participant) return null

  const identityFields = buildIdentityFields(user)
  if (Object.keys(identityFields).length === 0) return null
  if (!needsSync(participant, identityFields)) return null

  const [updated] = await db
    .update(participants)
    .set({ ...identityFields, updatedAt: new Date() })
    .where(eq(participants.participantId, participant.participantId))
    .returning()

  log?.info(
    { participantId: updated.participantId, planId, userId: user.id },
    'Participant identity synced from JWT profile'
  )

  return updated
}
