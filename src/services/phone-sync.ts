import { eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { participants, users } from '../db/schema.js'
import { checkPhoneOwnership } from './phone-guard.js'

type DbOrTransaction =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0]

interface MinimalLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void
}

export interface BootstrapResult {
  skipped: boolean
  reason?: 'conflict' | 'already_set'
}

export async function bootstrapUsersPhoneIfNull(
  db: DbOrTransaction,
  userId: string,
  normalizedPhone: string,
  log?: MinimalLogger
): Promise<BootstrapResult> {
  const ownership = await checkPhoneOwnership(db, userId, normalizedPhone)

  if (ownership.conflict) {
    log?.warn(
      { userId, ownerId: ownership.ownerId },
      'Skipping users.phone bootstrap — phone already owned by another user'
    )
    return { skipped: true, reason: 'conflict' }
  }

  await db
    .insert(users)
    .values({ userId, phone: normalizedPhone })
    .onConflictDoUpdate({
      target: users.userId,
      set: { phone: normalizedPhone, updatedAt: new Date() },
      setWhere: isNull(users.phone),
    })

  return { skipped: false }
}

export async function syncContactPhoneForAllUserParticipants(
  db: DbOrTransaction,
  userId: string,
  normalizedPhone: string
): Promise<void> {
  await db
    .update(participants)
    .set({ contactPhone: normalizedPhone, updatedAt: new Date() })
    .where(eq(participants.userId, userId))
}
