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
  signExpiredJwt,
  signJwtWithWrongKey,
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { eq } from 'drizzle-orm'
import { plans, participants, users } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

const USER_A_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const USER_B_ID = 'bbbbbbbb-1111-2222-3333-444444444444'

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

async function createPlanWithParticipant(
  db: Database,
  overrides: {
    visibility?: 'public' | 'invite_only' | 'private'
    createdByUserId?: string | null
    participantUserId?: string | null
    participantRole?: 'owner' | 'participant' | 'viewer'
  } = {}
) {
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Test Plan',
      status: 'active',
      visibility: overrides.visibility ?? 'invite_only',
      createdByUserId: overrides.createdByUserId ?? null,
    })
    .returning()

  const inviteToken = generateToken()
  const [participant] = await db
    .insert(participants)
    .values({
      planId: plan.planId,
      name: 'Guest',
      lastName: 'User',
      contactPhone: '+15550000001',
      role: overrides.participantRole ?? 'participant',
      userId: overrides.participantUserId ?? null,
      inviteToken,
    })
    .returning()

  return { plan, participant, inviteToken }
}

describe('POST /plans/:planId/claim/:inviteToken', () => {
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

  it('links authenticated user and syncs identity from user_metadata', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'bob@example.com',
      user_metadata: {
        first_name: 'Bob',
        last_name: 'Smith',
        phone: '+15559990000',
        avatar_url: 'https://example.com/avatar.jpg',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.userId).toBe(USER_A_ID)
    expect(body.inviteStatus).toBe('accepted')
    expect(body.planId).toBe(plan.planId)
    expect(body.name).toBe('Bob')
    expect(body.lastName).toBe('Smith')
    expect(body.contactEmail).toBe('bob@example.com')
    expect(body.contactPhone).toBe('+15550000001')
    expect(body.avatarUrl).toBe('https://example.com/avatar.jpg')

    const [u] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.userId, USER_A_ID))
    expect(u?.phone).toBe('+15550000001')
  })

  it('overwrites participant contact_phone with users.phone when the profile row exists', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    await db.insert(users).values({
      userId: USER_A_ID,
      phone: '+15559990000',
    })

    const jwt = await signTestJwt({
      sub: USER_A_ID,
      user_metadata: {
        first_name: 'Bob',
        last_name: 'Smith',
        phone: '+15551111111',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().contactPhone).toBe('+15559990000')
  })

  it('parses full_name from Google OAuth into firstName and lastName', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({
      sub: USER_A_ID,
      user_metadata: { full_name: 'Alice Johnson' },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.name).toBe('Alice')
    expect(body.lastName).toBe('Johnson')
  })

  it('keeps existing participant values when user_metadata lacks fields', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.name).toBe('Guest')
    expect(body.lastName).toBe('User')
    expect(body.contactPhone).toBe('+15550000001')
  })

  it('syncs email even without user_metadata', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({
      sub: USER_A_ID,
      email: 'claimer@example.com',
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().contactEmail).toBe('claimer@example.com')
  })

  it('plan is accessible via GET /plans/:planId after claiming', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({ sub: USER_A_ID })

    await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    const getResponse = await app.inject({
      method: 'GET',
      url: `/plans/${plan.planId}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(getResponse.statusCode).toBe(200)
    const fetched = getResponse.json()
    expect(fetched.planId).toBe(plan.planId)
    expect(fetched.participants).toBeDefined()
  })

  it('returns 200 idempotently when participant already linked to same user', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db, {
      participantUserId: USER_A_ID,
    })
    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().userId).toBe(USER_A_ID)
  })

  it('pre-fills empty participant preferences from user_details defaults', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)

    await db.insert(users).values({
      userId: USER_A_ID,
      foodPreferences: 'Vegetarian',
      allergies: 'Peanuts',
    })

    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.foodPreferences).toBe('Vegetarian')
    expect(body.allergies).toBe('Peanuts')
  })

  it('preserves existing participant preferences when user_details exist', async () => {
    const { plan, participant, inviteToken } =
      await createPlanWithParticipant(db)

    await db
      .update(participants)
      .set({ foodPreferences: 'Vegan', allergies: 'Gluten' })
      .where(eq(participants.participantId, participant.participantId))

    await db.insert(users).values({
      userId: USER_A_ID,
      foodPreferences: 'Vegetarian',
      allergies: 'Peanuts',
    })

    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.foodPreferences).toBe('Vegan')
    expect(body.allergies).toBe('Gluten')
  })

  it('returns 401 without JWT', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: {},
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with expired JWT', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signExpiredJwt()

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with wrong key JWT', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signJwtWithWrongKey()

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 404 for non-existent invite token', async () => {
    const { plan } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({ sub: USER_A_ID })
    const fakeToken = generateToken()

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${fakeToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().message).toBe(
      'Invalid invite token or plan not found'
    )
  })

  it('returns 404 when invite token belongs to a different plan', async () => {
    const { inviteToken } = await createPlanWithParticipant(db)
    const { plan: otherPlan } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${otherPlan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 400 when participant is already linked to a different user', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db, {
      participantUserId: USER_B_ID,
    })
    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe(
      'This participant is already linked to another account'
    )
  })

  it('returns 400 when user is already a participant in the plan', async () => {
    const { plan, inviteToken: firstToken } =
      await createPlanWithParticipant(db)

    await db.insert(participants).values({
      planId: plan.planId,
      name: 'Already',
      lastName: 'Linked',
      contactPhone: '+15550000099',
      role: 'participant',
      userId: USER_A_ID,
      inviteToken: generateToken(),
    })

    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${firstToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe(
      'You are already a participant in this plan'
    )
  })

  it('allows owner to claim their own participant spot', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db, {
      createdByUserId: USER_A_ID,
      participantRole: 'owner',
    })
    const jwt = await signTestJwt({ sub: USER_A_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().userId).toBe(USER_A_ID)
    expect(response.json().role).toBe('owner')
  })
})
