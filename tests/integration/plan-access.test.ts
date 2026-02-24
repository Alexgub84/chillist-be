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
import { plans, participants, items } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const PARTICIPANT_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const UNRELATED_USER_ID = 'cccccccc-1111-2222-3333-444444444444'
const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'

function signAdminJwt(overrides: { sub?: string } = {}) {
  return signTestJwt({
    sub: overrides.sub ?? ADMIN_USER_ID,
    app_metadata: { role: 'admin' },
  })
}

const validOwner = {
  name: 'Alex',
  lastName: 'Guberman',
  contactPhone: '+1-555-123-4567',
}

async function createPlanDirectly(
  db: Database,
  overrides: {
    visibility?: 'public' | 'invite_only' | 'private'
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
    it('defaults to invite_only when JWT is present', async () => {
      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Auth Plan', owner: validOwner },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('invite_only')
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

    it('allows signed-in user to set visibility to private', async () => {
      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Private Plan',
          visibility: 'private',
          owner: validOwner,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('private')
    })

    it('returns 400 when signed-in user sets visibility to public', async () => {
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

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toMatch(/signed-in users cannot/i)
    })

    it('allows admin to create public plan', async () => {
      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Admin Public Plan',
          visibility: 'public',
          owner: validOwner,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('public')
    })

    it.each(['invite_only', 'private'] as const)(
      'returns 400 when anonymous user sets visibility to %s',
      async (visibility) => {
        const response = await app.inject({
          method: 'POST',
          url: '/plans/with-owner',
          payload: {
            title: 'Restricted Plan',
            visibility,
            owner: validOwner,
          },
        })

        expect(response.statusCode).toBe(400)
        expect(response.json().message).toMatch(/anonymous users/i)
      }
    )
  })

  describe('PATCH /plans/:planId — visibility enforcement', () => {
    it('returns 400 when signed-in user updates visibility to public', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { visibility: 'public' },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toMatch(/signed-in users cannot/i)
    })

    it('allows admin to update visibility to public', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { visibility: 'public' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().visibility).toBe('public')
    })

    it.each(['invite_only', 'private'] as const)(
      'returns 400 when anonymous user updates visibility to %s',
      async (visibility) => {
        const { plan } = await createPlanDirectly(db, {
          visibility: 'public',
        })

        const response = await app.inject({
          method: 'PATCH',
          url: `/plans/${plan.planId}`,
          payload: { visibility },
        })

        expect(response.statusCode).toBe(400)
        expect(response.json().message).toMatch(/anonymous users/i)
      }
    )
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

    it('returns invite_only plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns invite_only plan to linked participant', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan with unrelated JWT user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan without JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns invite_only plan to linked viewer', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan with expired JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan with null createdByUserId', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns invite_only plan to admin (unrelated user)', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns private plan to admin (unrelated user)', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })
  })

  describe('Response shape — no information leakage', () => {
    it('unauthorized 404 is identical to nonexistent 404', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

  describe('Invite route — still works for invite_only plans', () => {
    it('returns plan data via invite token on invite_only plan', async () => {
      const { plan, owner } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${owner.inviteToken}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().planId).toBe(plan.planId)
    })

    it('returns 404 for wrong invite token on invite_only plan', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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
        visibility: 'invite_only',
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
        visibility: 'invite_only',
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
      expect(visibilities).toContain('invite_only')
    })

    it('includes plans where user is a linked participant', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('does not include other users invite_only plans', async () => {
      await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns all plans for admin regardless of visibility', async () => {
      await createPlanDirectly(db, { visibility: 'public' })
      await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })
      await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: UNRELATED_USER_ID,
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveLength(3)
      const visibilities = result.map(
        (p: { visibility: string }) => p.visibility
      )
      expect(visibilities).toContain('public')
      expect(visibilities).toContain('invite_only')
      expect(visibilities).toContain('private')
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

    it('returns participants for invite_only plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan participants with unrelated user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan participants without JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns participants for invite_only plan to admin', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
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

    it('returns items for invite_only plan to owner', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan items with unrelated user', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
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

    it('returns 404 for invite_only plan items without JWT', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns items for invite_only plan to admin', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Admin View Item',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
    })
  })

  describe('JWT fail-fast — invalid JWT returns 401 on write endpoints', () => {
    it('POST /plans/with-owner returns 401 with invalid JWT', async () => {
      const badToken = await signJwtWithWrongKey()

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${badToken}` },
        payload: { title: 'Should Fail', owner: validOwner },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().message).toBe(
        'JWT token present but verification failed'
      )
    })

    it('POST /plans/with-owner creates plan without JWT (public, no guard)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'No JWT Plan', owner: validOwner },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().createdByUserId).toBeNull()
      expect(response.json().visibility).toBe('public')
    })

    it('POST /plans/with-owner creates plan with valid JWT (invite_only, owner set)', async () => {
      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Valid JWT Plan', owner: validOwner },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().createdByUserId).toBe(OWNER_USER_ID)
      expect(response.json().visibility).toBe('invite_only')
    })

    it('PATCH /plans/:planId returns 401 with invalid JWT', async () => {
      const { plan } = await createPlanDirectly(db, { visibility: 'public' })
      const badToken = await signJwtWithWrongKey()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${badToken}` },
        payload: { title: 'Updated' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('DELETE /plans/:planId returns 401 with invalid JWT', async () => {
      const { plan } = await createPlanDirectly(db, { visibility: 'public' })
      const badToken = await signJwtWithWrongKey()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${badToken}` },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('DELETE /plans/:planId — access control', () => {
    it('returns 401 when no JWT is provided', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'public',
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().message).toBe('Authentication required')
    })

    it('allows owner to delete their own plan', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('allows admin to delete any plan', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'private',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it.each(['public', 'invite_only', 'private'] as const)(
      'admin can delete %s plan owned by another user',
      async (visibility) => {
        const { plan } = await createPlanDirectly(db, {
          visibility,
          createdByUserId: OWNER_USER_ID,
        })

        const token = await signAdminJwt()

        const response = await app.inject({
          method: 'DELETE',
          url: `/plans/${plan.planId}`,
          headers: { authorization: `Bearer ${token}` },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ ok: true })
      }
    )

    it('returns 404 when non-owner authenticated user tries to delete', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'public',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toBe('Plan not found')
    })

    it('returns 404 for nonexistent plan with valid JWT', async () => {
      const token = await signTestJwt({ sub: OWNER_USER_ID })

      const response = await app.inject({
        method: 'DELETE',
        url: '/plans/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('unauthorized 404 is identical to nonexistent 404 on delete', async () => {
      const { plan } = await createPlanDirectly(db, {
        visibility: 'invite_only',
        createdByUserId: OWNER_USER_ID,
      })

      const token = await signTestJwt({ sub: UNRELATED_USER_ID })

      const unauthorizedResponse = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const nonexistentResponse = await app.inject({
        method: 'DELETE',
        url: '/plans/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(unauthorizedResponse.statusCode).toBe(404)
      expect(nonexistentResponse.statusCode).toBe(404)
      expect(unauthorizedResponse.json()).toEqual(nonexistentResponse.json())
    })
  })
})
