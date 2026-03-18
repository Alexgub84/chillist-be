import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveUserByPhone } from '../../../src/services/internal-auth.service.js'

vi.mock('../../../src/utils/supabase-admin.js', () => ({
  fetchSupabaseUserMetadata: vi.fn(),
}))

import { fetchSupabaseUserMetadata } from '../../../src/utils/supabase-admin.js'

const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

function makeDb(row: Record<string, unknown> | null) {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(row ? [row] : []),
  }
  return queryBuilder as unknown as Parameters<typeof resolveUserByPhone>[0]
}

describe('resolveUserByPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no participant matches the phone', async () => {
    const db = makeDb(null)
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toBeNull()
  })

  it('uses Supabase displayName when available', async () => {
    const db = makeDb({
      userId: USER_ID,
      name: 'Old',
      lastName: 'Name',
      displayName: null,
    })
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue({
      displayName: 'Alex Guberman',
      phone: '+972501234567',
    })

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toEqual({ userId: USER_ID, displayName: 'Alex Guberman' })
    expect(fetchSupabaseUserMetadata).toHaveBeenCalledWith(USER_ID, undefined)
  })

  it('falls back to participant displayName when Supabase returns null', async () => {
    const db = makeDb({
      userId: USER_ID,
      name: 'Alex',
      lastName: 'G',
      displayName: 'Alex G (custom)',
    })
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toEqual({ userId: USER_ID, displayName: 'Alex G (custom)' })
  })

  it('falls back to name + lastName when Supabase returns null and displayName is null', async () => {
    const db = makeDb({
      userId: USER_ID,
      name: 'Alex',
      lastName: 'Guberman',
      displayName: null,
    })
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '+972501234567')

    expect(result).toEqual({ userId: USER_ID, displayName: 'Alex Guberman' })
  })

  it('normalizes phone — strips non-digits and adds + prefix', async () => {
    const db = makeDb(null)
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValue(null)

    const result = await resolveUserByPhone(db, '972501234567')

    expect(result).toBeNull()
  })
})
