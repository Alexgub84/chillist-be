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
      })
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

  describe('Plans routes remain accessible without auth', () => {
    it('GET /plans works without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: {},
      })

      expect(response.statusCode).toBe(200)
    })

    it('POST /plans/with-owner works without JWT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Owner',
            lastName: 'Test',
            contactPhone: '+1-555-000-0001',
          },
        },
      })

      expect(response.statusCode).toBe(201)
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
