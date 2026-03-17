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

// Requires a real database with seeded participants and a configured service key.
// Set these in .env or environment before running:
//   CHATBOT_SERVICE_KEY=<any value — matches what the chatbot would send>
//   TEST_INTERNAL_PHONE=<E.164 phone of a registered participant (userId set) in your DB>
//   TEST_INTERNAL_USER_ID=<expected Supabase userId for that phone>
//
// Skipped in CI. Run manually before deploy:
//   npx vitest run tests/e2e/internal-auth-prod.test.ts

const CREDS =
  process.env.CHATBOT_SERVICE_KEY &&
  process.env.TEST_INTERNAL_PHONE &&
  process.env.TEST_INTERNAL_USER_ID

describe.skipIf(!CREDS)('Internal Auth E2E — Real Supabase Admin', () => {
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

  it('resolves a known registered phone to userId and displayName', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/auth/identify',
      headers: { 'x-service-key': process.env.CHATBOT_SERVICE_KEY! },
      payload: { phoneNumber: process.env.TEST_INTERNAL_PHONE! },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.userType).toBe('registered')
    expect(body.userId).toBe(process.env.TEST_INTERNAL_USER_ID!)
    expect(typeof body.displayName).toBe('string')
    expect(body.displayName.length).toBeGreaterThan(0)
    expect(body.guestParticipants).toBeNull()
  })

  it('returns 404 for a phone not in the database', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/auth/identify',
      headers: { 'x-service-key': process.env.CHATBOT_SERVICE_KEY! },
      payload: { phoneNumber: '+19999999999' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ message: 'User not found' })
  })

  it('returns 401 with wrong service key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/auth/identify',
      headers: { 'x-service-key': 'wrong-key' },
      payload: { phoneNumber: process.env.TEST_INTERNAL_PHONE! },
    })

    expect(response.statusCode).toBe(401)
  })
})
