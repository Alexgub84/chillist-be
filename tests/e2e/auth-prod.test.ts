import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { closeTestDatabase, setupTestDatabase } from '../helpers/db.js'

function loadEnvFile() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env file not found
  }
}

loadEnvFile()

const SUPABASE_URL = process.env.SUPABASE_URL

describe.skipIf(!SUPABASE_URL)('Auth E2E — Real Supabase JWKS', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    const { buildApp } = await import('../../src/app.js')

    app = await buildApp({ db }, { logger: false })
  }, 30000)

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  describe('JWKS endpoint connectivity', () => {
    it('fetches keys from Supabase JWKS endpoint', async () => {
      const jwksUrl = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
      const response = await fetch(jwksUrl)

      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toHaveProperty('keys')
      expect(Array.isArray(body.keys)).toBe(true)
      expect(body.keys.length).toBeGreaterThan(0)
    })

    it('JWKS keys have required JWK fields', async () => {
      const jwksUrl = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
      const response = await fetch(jwksUrl)
      const body = await response.json()

      for (const key of body.keys) {
        expect(key).toHaveProperty('kty')
        expect(key).toHaveProperty('kid')
        expect(key).toHaveProperty('alg')
        expect(['EC', 'RSA', 'OKP']).toContain(key.kty)
        expect(key.key_ops).toContain('verify')
      }
    })
  })

  describe('App initialization with real Supabase URL', () => {
    it('enables JWT auth when SUPABASE_URL is set', () => {
      expect(app.jwtEnabled).toBe(true)
    })
  })

  describe('GET /auth/me with real JWKS', () => {
    it('returns 401 without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {},
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 with fabricated JWT', async () => {
      const fakeToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIn0.' +
        'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${fakeToken}` },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('Plans routes still work without auth', () => {
    it('GET /plans accessible without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: {},
      })

      expect(response.statusCode).toBe(200)
    })

    it('health endpoint accessible without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {},
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
