import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveUserByPhone,
  isAmbiguousPhoneLookup,
} from '../../../src/services/internal-auth.service.js'

vi.mock('../../../src/utils/supabase-admin.js', () => ({
  fetchSupabaseUserMetadata: vi.fn(),
}))

import { fetchSupabaseUserMetadata } from '../../../src/utils/supabase-admin.js'

const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-5555-6666-7777-888888888888'

function makeDb(
  usersRows: Array<Record<string, unknown>>,
  participantRow?: Record<string, unknown> | null
) {
  let queryIndex = 0
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      queryIndex++
      if (queryIndex === 1) {
        return Promise.resolve(usersRows)
      }
      return queryBuilder
    }),
    limit: vi.fn().mockImplementation(() => {
      return Promise.resolve(participantRow ? [participantRow] : [])
    }),
  }
  return queryBuilder as unknown as Parameters<typeof resolveUserByPhone>[0]
}

describe('resolveUserByPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no user row matches the phone', async () => {
    const db = makeDb([])
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toBeNull()
    expect(fetchSupabaseUserMetadata).not.toHaveBeenCalled()
  })

  it('uses Supabase displayName when available', async () => {
    const db = makeDb([{ userId: USER_ID }])
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue({
      displayName: 'Alex Guberman',
      phone: '+972501234567',
    })

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toEqual({ userId: USER_ID, displayName: 'Alex Guberman' })
    expect(fetchSupabaseUserMetadata).toHaveBeenCalledWith(USER_ID, undefined)
  })

  it('falls back to participant displayName when Supabase returns null', async () => {
    const db = makeDb([{ userId: USER_ID }], {
      name: 'Alex',
      lastName: 'G',
      displayName: 'Alex G (custom)',
    })
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toEqual({ userId: USER_ID, displayName: 'Alex G (custom)' })
  })

  it('falls back to name + lastName when Supabase returns null and displayName is null', async () => {
    const db = makeDb([{ userId: USER_ID }], {
      name: 'Alex',
      lastName: 'Guberman',
      displayName: null,
    })
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toEqual({ userId: USER_ID, displayName: 'Alex Guberman' })
  })

  it('returns null when Supabase returns null and no participant record exists', async () => {
    const db = makeDb([{ userId: USER_ID }], null)
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toBeNull()
  })

  it('normalizes phone — strips non-digits and adds + prefix', async () => {
    const db = makeDb([])
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '972501234567')

    expect(result).toBeNull()
    expect(fetchSupabaseUserMetadata).not.toHaveBeenCalled()
  })

  it('returns AmbiguousPhoneLookup when multiple users have the same phone', async () => {
    const db = makeDb([{ userId: USER_ID }, { userId: OTHER_USER_ID }])
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(isAmbiguousPhoneLookup(result)).toBe(true)
    if (isAmbiguousPhoneLookup(result)) {
      expect(result.ambiguous).toBe(true)
      expect(result.userIds).toHaveLength(2)
      expect(result.userIds).toContain(USER_ID)
      expect(result.userIds).toContain(OTHER_USER_ID)
    }
    expect(fetchSupabaseUserMetadata).not.toHaveBeenCalled()
  })
})
