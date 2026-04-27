import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { eq } from 'drizzle-orm'
import { plans, participants, users } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

vi.mock('../../src/utils/supabase-admin.js', () => ({
  fetchSupabaseUserMetadata: vi.fn().mockResolvedValue(null),
}))

import { fetchSupabaseUserMetadata } from '../../src/utils/supabase-admin.js'

const USER_A_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const USER_B_ID = 'bbbbbbbb-1111-2222-3333-444444444444'

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

async function createPlanWithParticipant(
  db: Database,
  userId: string,
  identity: {
    name: string
    lastName: string
    contactPhone: string
    contactEmail?: string | null
    displayName?: string | null
  }
) {
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Test Plan',
      status: 'active',
      visibility: 'invite_only',
      createdByUserId: userId,
    })
    .returning()

  const [participant] = await db
    .insert(participants)
    .values({
      planId: plan.planId,
      name: identity.name,
      lastName: identity.lastName,
      contactPhone: identity.contactPhone,
      contactEmail: identity.contactEmail ?? null,
      displayName: identity.displayName ?? null,
      role: 'participant',
      userId,
      inviteToken: generateToken(),
    })
    .returning()

  return { plan, participant }
}

describe('POST /auth/sync-profile', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()

    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  it('updates all participant records for the user across multiple plans', async () => {
    const old = {
      name: 'OldFirst',
      lastName: 'OldLast',
      contactPhone: '+15550000001',
    }
    const { participant: p1 } = await createPlanWithParticipant(
      db,
      USER_A_ID,
      old
    )
    const { participant: p2 } = await createPlanWithParticipant(
      db,
      USER_A_ID,
      old
    )

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'new@example.com',
      user_metadata: {
        first_name: 'NewFirst',
        last_name: 'NewLast',
        phone: '+15559990000',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().synced).toBe(2)

    const [row1] = await db
      .select()
      .from(participants)
      .where(eq(participants.participantId, p1.participantId))

    const [row2] = await db
      .select()
      .from(participants)
      .where(eq(participants.participantId, p2.participantId))

    expect(row1.name).toBe('NewFirst')
    expect(row1.lastName).toBe('NewLast')
    expect(row1.displayName).toBe('NewFirst NewLast')
    expect(row1.contactEmail).toBe('new@example.com')
    expect(row1.contactPhone).toBe('+15559990000')

    expect(row2.name).toBe('NewFirst')
    expect(row2.lastName).toBe('NewLast')
    expect(row2.displayName).toBe('NewFirst NewLast')
  })

  it('returns synced: 0 when no participant data differs', async () => {
    await createPlanWithParticipant(db, USER_A_ID, {
      name: 'Bob',
      lastName: 'Smith',
      contactPhone: '+15550000001',
      contactEmail: 'bob@example.com',
      displayName: 'Bob Smith',
    })

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'bob@example.com',
      user_metadata: { first_name: 'Bob', last_name: 'Smith' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().synced).toBe(0)
  })

  it('returns synced: 0 when user has no participant records', async () => {
    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'nobody@example.com',
      user_metadata: { first_name: 'Nobody' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().synced).toBe(0)
  })

  it('does not affect participants belonging to other users', async () => {
    await createPlanWithParticipant(db, USER_A_ID, {
      name: 'UserA',
      lastName: 'Original',
      contactPhone: '+15550000001',
    })

    const { participant: userBParticipant } = await createPlanWithParticipant(
      db,
      USER_B_ID,
      { name: 'UserB', lastName: 'Unchanged', contactPhone: '+15550000002' }
    )

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'a@example.com',
      user_metadata: { first_name: 'Changed', last_name: 'Name' },
    })

    await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    const [userBRow] = await db
      .select()
      .from(participants)
      .where(eq(participants.participantId, userBParticipant.participantId))

    expect(userBRow.name).toBe('UserB')
    expect(userBRow.lastName).toBe('Unchanged')
  })

  it('returns 401 without JWT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
    })

    expect(response.statusCode).toBe(401)
  })

  it('syncs phone from Supabase user_metadata when JWT lacks phone', async () => {
    const { participant } = await createPlanWithParticipant(db, USER_A_ID, {
      name: 'Alex',
      lastName: 'G',
      contactPhone: '',
    })

    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValueOnce({
      displayName: 'Alex G',
      phone: '+972501234567',
    })

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'alex@example.com',
      user_metadata: { first_name: 'Alex', last_name: 'G' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().synced).toBe(1)

    const [row] = await db
      .select()
      .from(participants)
      .where(eq(participants.participantId, participant.participantId))

    expect(row.contactPhone).toBe('+972501234567')
    expect(row.displayName).toBe('Alex G')
  })

  it('upserts users.phone when Supabase metadata contains phone', async () => {
    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValueOnce({
      displayName: 'Alex G',
      phone: '+972501234567',
    })

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'alex@example.com',
      user_metadata: { first_name: 'Alex', last_name: 'G' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)

    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.userId, USER_A_ID))

    expect(userRow).toBeDefined()
    expect(userRow.phone).toBe('+972501234567')
  })

  it('does not overwrite JWT phone with Supabase phone when JWT already has phone', async () => {
    await createPlanWithParticipant(db, USER_A_ID, {
      name: 'Alex',
      lastName: 'G',
      contactPhone: '+15550000001',
    })

    vi.mocked(fetchSupabaseUserMetadata).mockResolvedValueOnce({
      displayName: 'Alex G',
      phone: '+972501234567',
    })

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'alex@example.com',
      user_metadata: {
        first_name: 'Alex',
        last_name: 'G',
        phone: '+15550000001',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
  })

  it('handles Google OAuth full_name parsing across all plans', async () => {
    const old = {
      name: 'Old',
      lastName: 'Name',
      contactPhone: '+15550000001',
    }
    await createPlanWithParticipant(db, USER_A_ID, old)
    await createPlanWithParticipant(db, USER_A_ID, old)

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'alice@example.com',
      user_metadata: { full_name: 'Alice Johnson' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().synced).toBe(2)

    const rows = await db
      .select()
      .from(participants)
      .where(eq(participants.userId, USER_A_ID))

    for (const row of rows) {
      expect(row.name).toBe('Alice')
      expect(row.lastName).toBe('Johnson')
      expect(row.displayName).toBe('Alice Johnson')
      expect(row.contactEmail).toBe('alice@example.com')
    }
  })

  it('overwrites stale participant displayName when name metadata changes', async () => {
    const { participant } = await createPlanWithParticipant(db, USER_A_ID, {
      name: 'OldFirst',
      lastName: 'OldLast',
      contactPhone: '+15550000001',
      displayName: 'Old Display',
    })

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'new@example.com',
      user_metadata: {
        first_name: 'NewFirst',
        last_name: 'NewLast',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sync-profile',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().synced).toBe(1)

    const [row] = await db
      .select()
      .from(participants)
      .where(eq(participants.participantId, participant.participantId))

    expect(row.name).toBe('NewFirst')
    expect(row.lastName).toBe('NewLast')
    expect(row.displayName).toBe('NewFirst NewLast')
  })
})
