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
import { plans, participants, userDetails } from '../../src/db/schema.js'
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
      contactPhone: '+1-555-000-0001',
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

  it('links authenticated user to participant record', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({ sub: USER_A_ID })

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
    expect(body.name).toBe('Guest')
    expect(body.lastName).toBe('User')
  })

  it('plan appears in user plan list after claiming', async () => {
    const { plan, inviteToken } = await createPlanWithParticipant(db)
    const jwt = await signTestJwt({ sub: USER_A_ID })

    await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/claim/${inviteToken}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    const listResponse = await app.inject({
      method: 'GET',
      url: '/plans',
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(listResponse.statusCode).toBe(200)
    const planList = listResponse.json()
    expect(
      planList.some((p: { planId: string }) => p.planId === plan.planId)
    ).toBe(true)
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

    await db.insert(userDetails).values({
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

    await db.insert(userDetails).values({
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
      contactPhone: '+1-555-000-0099',
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
