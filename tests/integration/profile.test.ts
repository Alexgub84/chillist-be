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

const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const TEST_EMAIL = 'alex@example.com'

describe('Profile Endpoints', () => {
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

  describe('GET /auth/profile', () => {
    it('returns user identity with null preferences when no userDetails exist', async () => {
      const token = await signTestJwt({
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
      })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        user: {
          id: TEST_USER_ID,
          email: TEST_EMAIL,
          role: 'authenticated',
        },
        preferences: null,
      })
    })

    it('returns user identity with preferences after PATCH', async () => {
      const token = await signTestJwt({
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
      })

      await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          foodPreferences: 'vegetarian',
          allergies: 'nuts',
          defaultEquipment: ['tent', 'sleeping bag'],
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        user: {
          id: TEST_USER_ID,
          email: TEST_EMAIL,
          role: 'authenticated',
        },
        preferences: {
          foodPreferences: 'vegetarian',
          allergies: 'nuts',
          defaultEquipment: ['tent', 'sleeping bag'],
        },
      })
    })

    it('returns 401 without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: {},
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('PATCH /auth/profile', () => {
    it('creates userDetails on first call', async () => {
      const token = await signTestJwt({
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
      })

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          foodPreferences: 'vegan',
          allergies: 'gluten',
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        preferences: {
          foodPreferences: 'vegan',
          allergies: 'gluten',
          defaultEquipment: null,
        },
      })
    })

    it('updates only provided fields on subsequent calls', async () => {
      const token = await signTestJwt({
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
      })

      await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          foodPreferences: 'vegetarian',
          allergies: 'nuts',
          defaultEquipment: ['tent'],
        },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          allergies: 'dairy',
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        preferences: {
          foodPreferences: 'vegetarian',
          allergies: 'dairy',
          defaultEquipment: ['tent'],
        },
      })
    })

    it('allows clearing fields with null', async () => {
      const token = await signTestJwt({
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
      })

      await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          foodPreferences: 'vegetarian',
          allergies: 'nuts',
        },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          foodPreferences: null,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().preferences.foodPreferences).toBeNull()
      expect(response.json().preferences.allergies).toBe('nuts')
    })

    it('returns 401 without JWT', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/auth/profile',
        headers: {},
        payload: { foodPreferences: 'vegan' },
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
