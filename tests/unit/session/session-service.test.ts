import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  setupTestDatabase,
  closeTestDatabase,
  cleanupTestDatabase,
} from '../../helpers/db.js'
import { Database } from '../../../src/db/index.js'
import { sessions } from '../../../src/db/schema.js'
import {
  getDeviceType,
  isValidUuidV4,
  upsertSession,
  endSession,
} from '../../../src/services/session.service.js'

describe('getDeviceType', () => {
  it.each([
    [
      'iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15',
      'mobile',
    ],
    [
      'Android mobile',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile',
      'mobile',
    ],
    ['iPod', 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0)', 'mobile'],
    ['iPad', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'tablet'],
    [
      'Android tablet',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Silk/100',
      'tablet',
    ],
    [
      'Chrome desktop',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
      'desktop',
    ],
    [
      'Firefox desktop',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'desktop',
    ],
    ['empty string', '', 'desktop'],
  ] as const)('returns correct type for %s', (_label, ua, expected) => {
    expect(getDeviceType(ua)).toBe(expected)
  })
})

describe('isValidUuidV4', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidUuidV4('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('rejects non-UUID strings', () => {
    expect(isValidUuidV4('not-a-uuid')).toBe(false)
    expect(isValidUuidV4('')).toBe(false)
    expect(isValidUuidV4('550e8400-e29b-31d4-a716-446655440000')).toBe(false)
  })
})

describe('upsertSession + endSession (with DB)', () => {
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000'
  const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  it('inserts a new session row', async () => {
    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    expect(row).toBeDefined()
    expect(row.id).toBe(SESSION_ID)
    expect(row.userId).toBeNull()
    expect(row.deviceType).toBe('desktop')
    expect(row.userAgent).toBe('TestAgent/1.0')
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.lastActivityAt).toBeInstanceOf(Date)
    expect(row.endedAt).toBeNull()
  })

  it('updates last_activity_at on repeat upsert, preserves created_at', async () => {
    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'mobile',
      userAgent: 'TestAgent/1.0',
    })

    const [first] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    await new Promise((r) => setTimeout(r, 50))

    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'mobile',
      userAgent: 'TestAgent/1.0',
    })

    const [second] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime())
    expect(second.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
      first.lastActivityAt.getTime()
    )
  })

  it('fills in user_id when user logs in mid-session', async () => {
    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    await upsertSession(db, {
      id: SESSION_ID,
      userId: USER_ID,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    expect(row.userId).toBe(USER_ID)
  })

  it('does not clear user_id when subsequent request has no JWT', async () => {
    await upsertSession(db, {
      id: SESSION_ID,
      userId: USER_ID,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    expect(row.userId).toBe(USER_ID)
  })

  it('endSession sets ended_at', async () => {
    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    await endSession(db, SESSION_ID)

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    expect(row.endedAt).toBeInstanceOf(Date)
  })

  it('endSession is idempotent — does not update already-ended session', async () => {
    await upsertSession(db, {
      id: SESSION_ID,
      userId: null,
      deviceType: 'desktop',
      userAgent: 'TestAgent/1.0',
    })

    await endSession(db, SESSION_ID)

    const [first] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    await new Promise((r) => setTimeout(r, 50))
    await endSession(db, SESSION_ID)

    const [second] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, SESSION_ID))

    expect(second.endedAt!.getTime()).toBe(first.endedAt!.getTime())
  })

  it('endSession on non-existent session does not throw', async () => {
    await expect(
      endSession(db, '00000000-0000-4000-8000-000000000000')
    ).resolves.toBeUndefined()
  })
})
