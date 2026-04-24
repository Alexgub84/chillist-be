import { eq, and, ne } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { users } from '../db/schema.js'
import { normalizePhone } from '../utils/phone.js'

type DbOrTransaction =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0]

export class PhoneConflictError extends Error {
  readonly code = 'PHONE_CONFLICT'
  constructor(
    message = 'This phone number is already linked to another account'
  ) {
    super(message)
    this.name = 'PhoneConflictError'
  }
}

export interface PhoneGuardResult {
  conflict: boolean
  ownerId?: string
}

export async function checkPhoneOwnership(
  db: DbOrTransaction,
  userId: string,
  phone: string | null
): Promise<PhoneGuardResult> {
  if (!phone) {
    return { conflict: false }
  }

  const normalized = normalizePhone(phone)

  const [existing] = await db
    .select({ userId: users.userId })
    .from(users)
    .where(and(eq(users.phone, normalized), ne(users.userId, userId)))
    .limit(1)

  if (existing) {
    return { conflict: true, ownerId: existing.userId }
  }

  return { conflict: false }
}

export async function assertPhoneNotOwnedByOtherUser(
  db: DbOrTransaction,
  userId: string,
  phone: string | null
): Promise<void> {
  const result = await checkPhoneOwnership(db, userId, phone)
  if (result.conflict) {
    throw new PhoneConflictError()
  }
}
