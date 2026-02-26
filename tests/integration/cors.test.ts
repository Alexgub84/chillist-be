import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { setupTestDatabase, closeTestDatabase } from '../helpers/db.js'

vi.mock('../../src/config.js', () => ({
  config: {
    port: 3333,
    host: '0.0.0.0',
    nodeEnv: 'production',
    logLevel: 'error',
    isDev: false,
    databaseUrl: '',
    frontendUrl: 'https://test-frontend.example.com',
  },
}))

const TEST_FRONTEND_URL = 'https://test-frontend.example.com'

describe('CORS Preflight', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js')
    const db = await setupTestDatabase()
    app = await buildApp({ db }, { logger: false })
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  const routes = [
    '/plans',
    '/plans/test-id/items',
    '/plans/test-id/participants',
  ]

  it.each(routes)('OPTIONS %s returns 204 with CORS headers', async (route) => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: route,
      headers: {
        origin: TEST_FRONTEND_URL,
        'access-control-request-method': 'GET',
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(
      TEST_FRONTEND_URL
    )
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it.each(routes)(
    'OPTIONS %s includes PATCH and DELETE in allowed methods',
    async (route) => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: route,
        headers: {
          origin: TEST_FRONTEND_URL,
          'access-control-request-method': 'PATCH',
        },
      })

      expect(response.statusCode).toBe(204)
      const allowedMethods = response.headers[
        'access-control-allow-methods'
      ] as string
      expect(allowedMethods).toContain('PATCH')
      expect(allowedMethods).toContain('DELETE')
    }
  )

  it('rejects unauthenticated non-preflight requests with 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/plans',
      headers: {
        origin: TEST_FRONTEND_URL,
      },
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns CORS headers on authenticated non-preflight requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: TEST_FRONTEND_URL,
      },
    })

    expect(response.headers['access-control-allow-origin']).toBe(
      TEST_FRONTEND_URL
    )
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })
})
