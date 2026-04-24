import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkPhoneOwnership,
  assertPhoneNotOwnedByOtherUser,
  PhoneConflictError,
} from '../../../src/services/phone-guard.js'

const CALLER_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-5555-6666-7777-888888888888'

function makeDb(existingOwner: { userId: string } | null) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(existingOwner ? [existingOwner] : []),
  } as unknown as Parameters<typeof checkPhoneOwnership>[0]
}

describe('checkPhoneOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns conflict: false when phone is null', async () => {
    const db = makeDb(null)
    const result = await checkPhoneOwnership(db, CALLER_USER_ID, null)
    expect(result).toEqual({ conflict: false })
  })

  it('returns conflict: false when phone is empty string', async () => {
    const db = makeDb(null)
    const result = await checkPhoneOwnership(db, CALLER_USER_ID, '')
    expect(result).toEqual({ conflict: false })
  })

  it('returns conflict: false when no other user owns the phone', async () => {
    const db = makeDb(null)
    const result = await checkPhoneOwnership(
      db,
      CALLER_USER_ID,
      '+972501234567'
    )
    expect(result).toEqual({ conflict: false })
  })

  it('returns conflict: true with ownerId when another user owns the phone', async () => {
    const db = makeDb({ userId: OTHER_USER_ID })
    const result = await checkPhoneOwnership(
      db,
      CALLER_USER_ID,
      '+972501234567'
    )
    expect(result).toEqual({ conflict: true, ownerId: OTHER_USER_ID })
  })

  it('normalizes the phone before checking (strips spaces, adds +)', async () => {
    const db = makeDb(null)
    await checkPhoneOwnership(db, CALLER_USER_ID, '972 50 123 4567')
    expect(db.select).toHaveBeenCalled()
  })
})

describe('assertPhoneNotOwnedByOtherUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not throw when phone is null', async () => {
    const db = makeDb(null)
    await expect(
      assertPhoneNotOwnedByOtherUser(db, CALLER_USER_ID, null)
    ).resolves.toBeUndefined()
  })

  it('does not throw when phone is free', async () => {
    const db = makeDb(null)
    await expect(
      assertPhoneNotOwnedByOtherUser(db, CALLER_USER_ID, '+972501234567')
    ).resolves.toBeUndefined()
  })

  it('throws PhoneConflictError when another user owns the phone', async () => {
    const db = makeDb({ userId: OTHER_USER_ID })
    await expect(
      assertPhoneNotOwnedByOtherUser(db, CALLER_USER_ID, '+972501234567')
    ).rejects.toThrow(PhoneConflictError)
  })

  it('throws with the correct error code', async () => {
    const db = makeDb({ userId: OTHER_USER_ID })
    try {
      await assertPhoneNotOwnedByOtherUser(db, CALLER_USER_ID, '+972501234567')
      expect.fail('Expected PhoneConflictError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PhoneConflictError)
      expect((err as PhoneConflictError).code).toBe('PHONE_CONFLICT')
    }
  })
})
