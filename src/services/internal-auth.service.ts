import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { participants } from '../db/schema.js'
import { Database } from '../db/index.js'
import { normalizePhone } from '../utils/phone.js'

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
    .where(
      and(
        eq(participants.contactPhone, normalized),
        isNotNull(participants.userId)
      )
    )
    .orderBy(desc(participants.createdAt))
    .limit(1)

  if (!row?.userId) return null

  const displayName = row.displayName ?? `${row.name} ${row.lastName}`.trim()

  return { userId: row.userId, displayName }
}
