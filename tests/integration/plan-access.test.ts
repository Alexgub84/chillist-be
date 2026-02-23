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
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { plans, participants, items } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const PARTICIPANT_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const UNRELATED_USER_ID = 'cccccccc-1111-2222-3333-444444444444'

const validOwner = {
  name: 'Alex',
  lastName: 'Guberman',
  contactPhone: '+1-555-123-4567',
}

async function createPlanDirectly(
  db: Database,
  overrides: {
    visibility?: 'public' | 'unlisted' | 'private'
    createdByUserId?: string | null
  } = {}
) {
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Test Plan',
      status: 'active',
      visibility: overrides.visibility ?? 'public',
      createdByUserId: overrides.createdByUserId ?? null,
    })
    .returning()

  const [owner] = await db
    .insert(participants)
    .values({
      planId: plan.planId,
      name: 'Owner',
      lastName: 'User',
      contactPhone: '+1-555-000-0001',
      role: 'owner',
      userId: overrides.createdByUserId ?? null,
      inviteToken: randomBytes(32).toString('hex'),
    })
    .returning()

  return { plan, owner }
}

async function linkParticipant(
  db: Database,
  planId: string,
  userId: string,
  role: 'participant' | 'viewer' = 'participant'
) {
  const [participant] = await db
    .insert(participants)
    .values({
      planId,
      name: 'Linked',
      lastName: 'Participant',
      contactPhone: '+1-555-000-0002',
      role,
      userId,
      inviteToken: randomBytes(32).toString('hex'),
    })
    .returning()

  return participant
}

describe('Plan Access Control', () => {
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

  describe('POST /plans/with-owner — visibility defaults', () => {
    it('defaults to unlisted when JWT is present', async () => {
      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Auth Plan', owner: validOwner },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('unlisted')
    })

    it('defaults to public when no JWT is present', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'Public Plan', owner: validOwner },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('public')
    })

    it('respects explicit visibility even with JWT', async () => {
      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Explicit Public',
          visibility: 'public',
          owner: validOwner,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('public')
    })
  })

  describe('GET /plans/:planId — access control', () => {
    it('returns public plan to anyone', async () => {
      const { plan } = await createPlanDirectly(db, { visibility: 'public' })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns unlisted plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns unlisted plan to linked participant', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      await linkParticipant(db, plan.planId, PARTICIPANT_USER_ID)

      const token = await signTestJwt({ sub: PARTICIPANT_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns 404 for unlisted plan with unrelated JWT user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for unlisted plan without JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for private plan with unrelated JWT user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for nonexistent plan', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000',
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns private plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns unlisted plan to linked viewer', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      await linkParticipant(db, plan.planId, PARTICIPANT_USER_ID, 'viewer')

      const token = await signTestJwt({ sub: PARTICIPANT_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns 404 for unlisted plan with expired JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const expiredToken = await signExpiredJwt()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${expiredToken}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for unlisted plan with null createdByUserId', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: null,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('Response shape — no information leakage', () => {
    it('unauthorized 404 is identical to nonexistent 404', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const unauthorizedResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const nonexistentResponse = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(unauthorizedResponse.statusCode).toBe(404)
      expect(nonexistentResponse.statusCode).toBe(404)
      expect(unauthorizedResponse.json()).toEqual(nonexistentResponse.json())
    })
  })

  describe('Invite route — still works for unlisted plans', () => {
    it('returns plan data via invite token on unlisted plan', async () => {
      const { plan, owner } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${owner.inviteToken}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns 404 for wrong invite token on unlisted plan', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const fakeToken = randomBytes(32).toString('hex')

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${fakeToken}`,
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /plans — list filtering', () => {
    it('returns only public plans when no JWT', async () => {
      await createPlanDirectly(db, { visibility: 'public' })
      await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })
      await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveLength(1)
      expect(result[0].visibility).toBe('public')
    })

    it('returns own plans + public plans with JWT', async () => {
      await createPlanDirectly(db, { visibility: 'public' })
      await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })
      await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: UNRELATED_USER_ID,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveLength(2)
      const visibilities = result.map(
        (p: { visibility: string }) => p.visibility
      )
      expect(visibilities).toContain('public')
      expect(visibilities).toContain('unlisted')
    })

    it('includes plans where user is a linked participant', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      await linkParticipant(db, plan.planId, PARTICIPANT_USER_ID)

      const token = await signTestJwt({ sub: PARTICIPANT_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(
        result.some((p: { planId: string }) => p.planId === plan.planId)
      ).toBe(true)
    })

    it('does not include other users unlisted plans', async () => {
      await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(0)
    })
  })

  describe('GET /plans/:planId/participants — access control', () => {
    it('returns participants for public plan', async () => {
      const { plan } = await createPlanDirectly(db, { visibility: 'public' })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
    })

    it('returns participants for unlisted plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
    })

    it('returns 404 for unlisted plan participants with unrelated user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for unlisted plan participants without JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /plans/:planId/items — access control', () => {
    it('returns items for public plan', async () => {
      const { plan } = await createPlanDirectly(db, { visibility: 'public' })

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Tent',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
    })

    it('returns items for unlisted plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Sleeping bag',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
    })

    it('returns 404 for unlisted plan items with unrelated user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for unlisted plan items without JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'unlisted',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
