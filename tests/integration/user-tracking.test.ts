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

const validOwner = {
  name: 'Alex',
  lastName: 'Guberman',
  contactPhone: '+1-555-123-4567',
}

const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('Opportunistic User Tracking', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
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

  describe('POST /plans/with-owner — user tracking', () => {
    it('sets createdByUserId and owner userId when JWT is present', async () => {
      const token = await signTestJwt({ sub: TEST_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Authenticated Plan',
          owner: validOwner,
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.createdByUserId).toBe(TEST_USER_ID)

      const ownerParticipant = plan.participants.find(
        (p: { role: string }) => p.role === 'owner'
      )
      expect(ownerParticipant.userId).toBe(TEST_USER_ID)
    })

    it('leaves createdByUserId and owner userId null without JWT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Anonymous Plan',
          owner: validOwner,
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.createdByUserId).toBeNull()

      const ownerParticipant = plan.participants.find(
        (p: { role: string }) => p.role === 'owner'
      )
      expect(ownerParticipant.userId).toBeNull()
    })

    it('only sets userId on owner, not on other participants', async () => {
      const token = await signTestJwt({ sub: TEST_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Group Plan',
          owner: validOwner,
          participants: [
            {
              name: 'John',
              lastName: 'Doe',
              contactPhone: '+1-555-111-1111',
            },
            {
              name: 'Jane',
              lastName: 'Smith',
              contactPhone: '+1-555-222-2222',
            },
          ],
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      const owner = plan.participants.find(
        (p: { role: string }) => p.role === 'owner'
      )
      const others = plan.participants.filter(
        (p: { role: string }) => p.role !== 'owner'
      )

      expect(owner.userId).toBe(TEST_USER_ID)
      for (const p of others) {
        expect(p.userId).toBeNull()
      }
    })

    it('persists userId — retrievable via GET /plans/:planId', async () => {
      const token = await signTestJwt({ sub: TEST_USER_ID })

      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Persistent Tracking Plan',
          owner: validOwner,
        },
      })

      const createdPlan = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(getResponse.statusCode).toBe(200)

      const plan = getResponse.json()
      expect(plan.createdByUserId).toBe(TEST_USER_ID)
      expect(plan.participants[0].userId).toBe(TEST_USER_ID)
    })
  })
})
