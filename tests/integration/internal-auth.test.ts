import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  setupTestDatabase,
} from '../helpers/db.js'
import { setupTestKeys, getTestJWKS, getTestIssuer } from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { participants, plans } from '../../src/db/schema.js'

const VALID_SERVICE_KEY = 'test-service-key-abc123'
const REGISTERED_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const REGISTERED_PHONE = '+972501234567'

describe('Internal Auth — POST /api/internal/auth/identify', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()

    process.env.CHATBOT_SERVICE_KEY = VALID_SERVICE_KEY

    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  }, 30000)

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
    delete process.env.CHATBOT_SERVICE_KEY
  })

  beforeEach(async () => {
    await cleanupTestDatabase()

    const [plan] = await db
      .insert(plans)
      .values({
        title: 'Test Plan',
        status: 'active',
        visibility: 'invite_only',
      })
      .returning()

    await db.insert(participants).values({
      planId: plan.planId,
      name: 'Alex',
      lastName: 'Cohen',
      contactPhone: REGISTERED_PHONE,
      userId: REGISTERED_USER_ID,
      inviteStatus: 'accepted',
    })
  })

  describe('Service key validation', () => {
    it('returns 401 when x-service-key header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        payload: { phoneNumber: REGISTERED_PHONE },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-service-key is wrong', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': 'wrong-key' },
        payload: { phoneNumber: REGISTERED_PHONE },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })
  })

  describe('User found', () => {
    it('returns 200 with userId and displayName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: { phoneNumber: REGISTERED_PHONE },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.userId).toBe(REGISTERED_USER_ID)
      expect(body.displayName).toBe('Alex Cohen')
    })

    it('resolves displayName from name + lastName when displayName column is null', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: { phoneNumber: REGISTERED_PHONE },
      })

      expect(response.json().displayName).toBe('Alex Cohen')
    })

    it('returns the most recent participant row when same phone is in multiple plans', async () => {
      const [plan2] = await db
        .insert(plans)
        .values({
          title: 'Plan 2',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const OTHER_USER_ID = 'bbbbbbbb-2222-3333-4444-555555555555'
      await db.insert(participants).values({
        planId: plan2.planId,
        name: 'Alex',
        lastName: 'Other',
        contactPhone: REGISTERED_PHONE,
        userId: OTHER_USER_ID,
        inviteStatus: 'accepted',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: { phoneNumber: REGISTERED_PHONE },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().userId).toBe(OTHER_USER_ID)
    })
  })

  describe('User not found', () => {
    it('returns 404 for a phone not in participants', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: { phoneNumber: '+999000000000' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'User not found' })
    })

    it('returns 404 for a participant with no userId (pending invite)', async () => {
      const [plan] = await db.select().from(plans).limit(1)

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Pending',
        lastName: 'User',
        contactPhone: '+972599000000',
        userId: null,
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: { phoneNumber: '+972599000000' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'User not found' })
    })
  })

  describe('Phone normalization', () => {
    it.each([['+972 50 123 4567'], ['+972-50-123-4567'], ['972501234567']])(
      'normalizes %s and finds the user',
      async (input) => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/internal/auth/identify',
          headers: { 'x-service-key': VALID_SERVICE_KEY },
          payload: { phoneNumber: input },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json().userId).toBe(REGISTERED_USER_ID)
      }
    )
  })

  describe('Request validation', () => {
    it('returns 400 when phoneNumber is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when phoneNumber is too short', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/auth/identify',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
        payload: { phoneNumber: '123' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('Route isolation', () => {
    it('GET /health requires no service key', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' })
      expect(response.statusCode).toBe(200)
    })

    it('GET /plans requires JWT, not service key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: { 'x-service-key': VALID_SERVICE_KEY },
      })
      expect(response.statusCode).toBe(401)
    })
  })
})
