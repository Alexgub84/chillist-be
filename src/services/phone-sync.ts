import { eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { participants, users } from '../db/schema.js'

type DbOrTransaction =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0]

export async function bootstrapUsersPhoneIfNull(
  db: DbOrTransaction,
  userId: string,
  normalizedPhone: string
): Promise<void> {
  await db
    .insert(users)
    .values({ userId, phone: normalizedPhone })
    .onConflictDoUpdate({
      target: users.userId,
      set: { phone: normalizedPhone, updatedAt: new Date() },
      setWhere: isNull(users.phone),
    })
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
