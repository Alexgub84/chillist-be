import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestParticipants,
  seedTestPlans,
  seedTestItems,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('Guest Permission Boundaries', () => {
  let app: FastifyInstance
  let jwtToken: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    jwtToken = await signTestJwt({ sub: TEST_USER_ID })
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

  async function seedPlanWithParticipants() {
    const [plan] = await seedTestPlans(1)
    const participantList = await seedTestParticipants(plan.planId, 2)
    const itemList = await seedTestItems(plan.planId, 2)
    return { plan, participants: participantList, items: itemList }
  }

  function guestHeaders(inviteToken: string) {
    return { 'x-invite-token': inviteToken }
  }

  function ownerHeaders() {
    return { authorization: `Bearer ${jwtToken}` }
  }

  describe('baseline: authenticated owner can access protected routes', () => {
    it('owner can list plans', async () => {
      await seedTestPlans(1)
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: ownerHeaders(),
      })
      expect(response.statusCode).toBe(200)
    })

    it('owner can create a participant', async () => {
      const [plan] = await seedTestPlans(1)
      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: ownerHeaders(),
        payload: {
          name: 'Test',
          lastName: 'Person',
          contactPhone: '+1-555-000-0001',
        },
      })
      expect(response.statusCode).toBe(201)
    })
  })

  describe('guest with only X-Invite-Token cannot access plan endpoints', () => {
    it.each([
      ['GET', '/plans'],
      ['POST', '/plans'],
    ])('%s %s returns 401 for guest-only auth', async (method, url) => {
      await seedTestPlans(1)
      const response = await app.inject({
        method: method as 'GET' | 'POST',
        url,
        headers: guestHeaders('any-token'),
        ...(method === 'POST'
          ? {
              payload: {
                title: 'Hacked Plan',
                owner: {
                  name: 'Hack',
                  lastName: 'Er',
                  contactPhone: '+1-555-000-0000',
                },
              },
            }
          : {}),
      })
      expect(response.statusCode).toBe(401)
    })

    it('cannot get a specific plan', async () => {
      const { plan, participants } = await seedPlanWithParticipants()
      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: guestHeaders(participants[1].inviteToken!),
      })
      expect(response.statusCode).toBe(401)
    })

    it('cannot update a plan', async () => {
      const { plan, participants } = await seedPlanWithParticipants()
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: guestHeaders(participants[1].inviteToken!),
        payload: { title: 'Hacked Title' },
      })
      expect(response.statusCode).toBe(401)
    })

    it('cannot delete a plan', async () => {
      const { plan, participants } = await seedPlanWithParticipants()
      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: guestHeaders(participants[1].inviteToken!),
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('guest with only X-Invite-Token cannot access auth endpoints', () => {
    it.each([
      ['GET', '/auth/me'],
      ['GET', '/auth/profile'],
      ['PATCH', '/auth/profile'],
    ])('%s %s returns 401 for guest-only auth', async (method, url) => {
      const { participants } = await seedPlanWithParticipants()
      const response = await app.inject({
        method: method as 'GET' | 'PATCH',
        url,
        headers: guestHeaders(participants[1].inviteToken!),
        ...(method === 'PATCH'
          ? { payload: { foodPreferences: 'hacked' } }
          : {}),
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('guest with only X-Invite-Token CAN access allowed routes', () => {
    it('can access invite route without API key', async () => {
      const { plan, participants } = await seedPlanWithParticipants()
      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participants[1].inviteToken}`,
        headers: guestHeaders(participants[1].inviteToken!),
      })
      expect(response.statusCode).toBe(200)
    })

    it('can access health endpoint without any auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })
      expect(response.statusCode).toBe(200)
    })

    it('/guest/ routes return 404', async () => {
      const { participants } = await seedPlanWithParticipants()
      const response = await app.inject({
        method: 'GET',
        url: '/guest/plan',
        headers: guestHeaders(participants[1].inviteToken!),
      })
      expect(response.statusCode).toBe(404)
    })

    it('/invite/ routes return 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/invite/fake-token/start-session',
      })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('no auth at all is rejected on plans routes', () => {
    it.each([
      ['GET', '/plans'],
      ['GET', '/plans/00000000-0000-0000-0000-000000000000'],
      ['POST', '/plans'],
      ['PATCH', '/plans/00000000-0000-0000-0000-000000000000'],
      ['DELETE', '/plans/00000000-0000-0000-0000-000000000000'],
    ])('%s %s returns 401 with no auth headers', async (method, url) => {
      const response = await app.inject({
        method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
        url,
        headers: {},
      })
      expect(response.statusCode).toBe(401)
    })
  })
})
