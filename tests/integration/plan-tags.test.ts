import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { closeTestDatabase, setupTestDatabase } from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const SERVICE_KEY = 'test-service-key-12345'

describe('GET /plan-tags (FE endpoint — JWT required)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    process.env.CHATBOT_SERVICE_KEY = SERVICE_KEY
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
    delete process.env.CHATBOT_SERVICE_KEY
  })

  it('returns 401 without JWT', async () => {
    const res = await app.inject({ method: 'GET', url: '/plan-tags' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with invalid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: 'Bearer invalid.token.here' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with full taxonomy when authenticated', async () => {
    const token = await signTestJwt({
      sub: 'user-123',
      email: 'test@example.com',
    })
    const res = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.version).toBe('string')
    expect(body).toHaveProperty('tier1')
    expect(body).toHaveProperty('universal_flags')
    expect(body).toHaveProperty('tier2_axes')
    expect(body).toHaveProperty('tier3')
    expect(body).toHaveProperty('item_generation_bundles')
  })

  it('tier1 options have id, bilingual label, emoji', async () => {
    const token = await signTestJwt({
      sub: 'user-123',
      email: 'test@example.com',
    })
    const res = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${token}` },
    })
    const body = res.json()
    const options = body.tier1.options as Array<{
      id: string
      label: { en: string; he: string }
      emoji: string
    }>
    expect(options.length).toBeGreaterThan(0)
    for (const opt of options) {
      expect(typeof opt.id).toBe('string')
      expect(typeof opt.label).toBe('object')
      expect(typeof opt.label.en).toBe('string')
      expect(typeof opt.label.he).toBe('string')
      expect(typeof opt.emoji).toBe('string')
    }
  })
})

describe('GET /api/internal/plan-tags (chatbot endpoint — x-service-key)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    process.env.CHATBOT_SERVICE_KEY = SERVICE_KEY
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
    delete process.env.CHATBOT_SERVICE_KEY
  })

  it('returns 401 without x-service-key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with wrong x-service-key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': 'wrong-key' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with full taxonomy when authenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': SERVICE_KEY },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.version).toBe('string')
    expect(body).toHaveProperty('tier1')
    expect(body).toHaveProperty('universal_flags')
    expect(body).toHaveProperty('tier2_axes')
    expect(body).toHaveProperty('tier3')
    expect(body).toHaveProperty('item_generation_bundles')
  })

  it('FE and internal endpoints return the same taxonomy', async () => {
    const token = await signTestJwt({
      sub: 'user-123',
      email: 'test@example.com',
    })
    const [feRes, internalRes] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/plan-tags',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/internal/plan-tags',
        headers: { 'x-service-key': SERVICE_KEY },
      }),
    ])
    expect(feRes.statusCode).toBe(200)
    expect(internalRes.statusCode).toBe(200)
    expect(feRes.json()).toEqual(internalRes.json())
  })
})
