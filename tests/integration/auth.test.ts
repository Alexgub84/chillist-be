import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
  signExpiredJwt,
  signJwtWithWrongKey,
  signJwtWithWrongIssuer,
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { users } from '../../src/db/schema.js'

describe('JWT Auth (injected JWKS)', () => {
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

  describe('GET /auth/me — returns user from JWT', () => {
    it('returns user identity with valid JWT', async () => {
      const token = await signTestJwt({
        sub: 'user-uuid-1234',
        email: 'alex@example.com',
        role: 'authenticated',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        user: {
          id: 'user-uuid-1234',
          email: 'alex@example.com',
          role: 'authenticated',
        },
        sessionId: null,
      })
    })

    it('returns sessionId from X-Session-ID header', async () => {
      const browserSessionId = '550e8400-e29b-41d4-a716-446655440000'
      const token = await signTestJwt({
        sub: 'user-uuid-1234',
        email: 'alex@example.com',
        role: 'authenticated',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': browserSessionId,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().sessionId).toBe(browserSessionId)
    })

    it('returns sessionId null when X-Session-ID header is absent', async () => {
      const token = await signTestJwt({
        sub: 'user-uuid-1234',
        email: 'alex@example.com',
        role: 'authenticated',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().sessionId).toBeNull()
    })

    it('defaults email to empty string when not in token', async () => {
      const token = await signTestJwt({ email: null })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().user.email).toBe('')
    })

    it('defaults role to authenticated when not in token', async () => {
      const token = await signTestJwt({ role: null })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().user.role).toBe('authenticated')
    })

    it('returns 401 without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {},
      })

      expect(response.statusCode).toBe(401)
    })

    it.each([
      ['expired', () => signExpiredJwt()],
      ['wrong signing key', () => signJwtWithWrongKey()],
      ['wrong issuer', () => signJwtWithWrongIssuer()],
    ])('returns 401 with %s JWT', async (_label, signFn) => {
      const token = await signFn()

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 with malformed JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: 'Bearer not.a.jwt' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('Plans routes require JWT', () => {
    it('GET /plans returns 401 without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: {},
      })

      expect(response.statusCode).toBe(401)
    })

    it('POST /plans returns 401 without JWT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Owner',
            lastName: 'Test',
            contactPhone: '+15550000001',
          },
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('Public routes bypass auth', () => {
    it('health endpoint accessible without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {},
      })

      expect(response.statusCode).toBe(200)
    })

    it('invite route accessible without auth', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const token = participants[0].inviteToken!

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
        headers: {},
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('jwtEnabled flag', () => {
    it('sets jwtEnabled to true when JWKS is configured', () => {
      expect(app.jwtEnabled).toBe(true)
    })
  })
})

describe('Phone conflict handling', () => {
  let app: FastifyInstance
  let db: Database

  const USER_A_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
  const USER_B_ID = 'bbbbbbbb-5555-6666-7777-888888888888'
  const PHONE_A = '+972501234567'
  const PHONE_B = '+972509876543'

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()

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
  })

  beforeEach(async () => {
    await cleanupTestDatabase()

    await db.insert(users).values([
      { userId: USER_A_ID, phone: PHONE_A },
      { userId: USER_B_ID, phone: PHONE_B },
    ])
  })

  describe('PATCH /auth/profile — phone conflict returns 409', () => {
    it('returns 200 when setting phone to a free number', async () => {
      const jwt = await signTestJwt({ sub: USER_A_ID })
      const newPhone = '+972500000000'

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${jwt}` },
        payload: { phone: newPhone },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().preferences.phone).toBe(newPhone)
    })

    it('returns 200 when setting phone to own current number (idempotent)', async () => {
      const jwt = await signTestJwt({ sub: USER_A_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${jwt}` },
        payload: { phone: PHONE_A },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().preferences.phone).toBe(PHONE_A)
    })

    it('returns 409 when trying to set phone owned by another user', async () => {
      const jwt = await signTestJwt({ sub: USER_A_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${jwt}` },
        payload: { phone: PHONE_B },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('already linked')
    })

    it('returns 200 when clearing phone to null', async () => {
      const jwt = await signTestJwt({ sub: USER_A_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${jwt}` },
        payload: { phone: null },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().preferences.phone).toBeNull()
    })
  })
})
