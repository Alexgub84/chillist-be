import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
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
import { plans, participants } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

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
      contactPhone: '+1-555-000-0001',
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
        phone: '+1-555-999-0000',
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
    expect(row1.contactEmail).toBe('new@example.com')
    expect(row1.contactPhone).toBe('+1-555-999-0000')

    expect(row2.name).toBe('NewFirst')
    expect(row2.lastName).toBe('NewLast')
  })

  it('returns synced: 0 when no participant data differs', async () => {
    await createPlanWithParticipant(db, USER_A_ID, {
      name: 'Bob',
      lastName: 'Smith',
      contactPhone: '+1-555-000-0001',
      contactEmail: 'bob@example.com',
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
      contactPhone: '+1-555-000-0001',
    })

    const { participant: userBParticipant } = await createPlanWithParticipant(
      db,
      USER_B_ID,
      { name: 'UserB', lastName: 'Unchanged', contactPhone: '+1-555-000-0002' }
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

  it('handles Google OAuth full_name parsing across all plans', async () => {
    const old = {
      name: 'Old',
      lastName: 'Name',
      contactPhone: '+1-555-000-0001',
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
      expect(row.contactEmail).toBe('alice@example.com')
    }
  })
})
