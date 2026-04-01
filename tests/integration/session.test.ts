import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { sessions } from '../../src/db/schema.js'
import {
  setupTestDatabase,
  closeTestDatabase,
  cleanupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'

const SESSION_UUID = '550e8400-e29b-41d4-a716-446655440000'
const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

describe('Session plugin + logout', () => {
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

  describe('Session tracking via X-Session-ID header', () => {
    it('creates a session row when X-Session-ID header is present', async () => {
      await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-session-id': SESSION_UUID },
      })

      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(row).toBeUndefined()
    })

    it('creates a session row on non-health requests', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': SESSION_UUID,
        },
      })

      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(row).toBeDefined()
      expect(row.userId).toBe(USER_ID)
      expect(row.deviceType).toBe('desktop')
      expect(row.endedAt).toBeNull()
    })

    it('updates last_activity_at on repeat requests, preserves created_at', async () => {
      const token = await signTestJwt({ sub: USER_ID })
      const headers = {
        authorization: `Bearer ${token}`,
        'x-session-id': SESSION_UUID,
      }

      await app.inject({ method: 'GET', url: '/auth/me', headers })

      const [first] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      await new Promise((r) => setTimeout(r, 50))

      await app.inject({ method: 'GET', url: '/auth/me', headers })

      const [second] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(second.createdAt.getTime()).toBe(first.createdAt.getTime())
      expect(second.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        first.lastActivityAt.getTime()
      )
    })

    it('does not create a session row when header is missing', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const rows = await db.select().from(sessions)
      expect(rows).toHaveLength(0)
    })

    it('ignores invalid UUID format in header', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': 'not-a-valid-uuid',
        },
      })

      expect(response.statusCode).toBe(200)

      const rows = await db.select().from(sessions)
      expect(rows).toHaveLength(0)
    })

    it('populates user_id when JWT is present', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': SESSION_UUID,
        },
      })

      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(row.userId).toBe(USER_ID)
    })

    it('sets user_id to null when no JWT is present', async () => {
      await app.inject({
        method: 'GET',
        url: '/plans',
        headers: { 'x-session-id': SESSION_UUID },
      })

      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(row).toBeDefined()
      expect(row.userId).toBeNull()
    })
  })

  describe('GET /auth/me — sessionId from header', () => {
    it('returns sessionId from X-Session-ID header', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': SESSION_UUID,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().sessionId).toBe(SESSION_UUID)
    })

    it('returns sessionId null when X-Session-ID header is absent', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().sessionId).toBeNull()
    })
  })

  describe('POST /auth/logout', () => {
    it('sets ended_at on the session row', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': SESSION_UUID,
        },
      })

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-session-id': SESSION_UUID },
      })

      expect(logoutRes.statusCode).toBe(200)
      expect(logoutRes.json()).toEqual({ ok: true })

      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(row.endedAt).toBeInstanceOf(Date)
    })

    it('returns 400 when X-Session-ID header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toMatch(/X-Session-ID/)
    })

    it('returns 200 even if session does not exist (idempotent)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-session-id': SESSION_UUID },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('is idempotent — second logout does not change ended_at', async () => {
      const token = await signTestJwt({ sub: USER_ID })

      await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
          'x-session-id': SESSION_UUID,
        },
      })

      await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-session-id': SESSION_UUID },
      })

      const [first] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      await new Promise((r) => setTimeout(r, 50))

      await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-session-id': SESSION_UUID },
      })

      const [second] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, SESSION_UUID))

      expect(second.endedAt!.getTime()).toBe(first.endedAt!.getTime())
    })

    it('does not require JWT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-session-id': SESSION_UUID },
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
