import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { plansRoutes } from '../../src/routes/plans.route.js'
import { registerSchemas } from '../../src/schemas/index.js'

function createMockDb() {
  return {
    select: vi.fn(),
    query: {
      plans: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
  }
}

describe('Plans Route - Error Scenarios', () => {
  let app: ReturnType<typeof Fastify>
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDb = createMockDb()

    app = Fastify({ logger: false })
    app.decorate('db', mockDb)
    registerSchemas(app)
    await app.register(plansRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /plans - Database Errors', () => {
    function mockListChainError(error: unknown) {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockRejectedValue(error),
          }),
        }),
      })
    }

    it('returns 503 when database connection fails', async () => {
      mockListChainError(new Error('connect ECONNREFUSED'))

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        message: 'Database connection error',
      })
    })

    it('returns 500 when database query fails with unknown error', async () => {
      mockListChainError(new Error('Unknown database error'))

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Failed to retrieve plans',
      })
    })

    it('returns 500 when non-Error is thrown', async () => {
      mockListChainError('string error')

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Failed to retrieve plans',
      })
    })

    it('returns 503 when connection timeout occurs', async () => {
      mockListChainError(new Error('connection timeout'))

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        message: 'Database connection error',
      })
    })
  })

  describe('GET /plans/:planId - Database Errors', () => {
    function mockSelectChainError(error: unknown) {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(error),
        }),
      })
    }

    it('returns 503 when database connection fails', async () => {
      mockSelectChainError(new Error('connect ECONNREFUSED'))

      const response = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        message: 'Database connection error',
      })
    })

    it('returns 500 when database query fails with unknown error', async () => {
      mockSelectChainError(new Error('Unknown database error'))

      const response = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000',
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Failed to retrieve plan',
      })
    })

    it('returns 500 when non-Error is thrown', async () => {
      mockSelectChainError('string error')

      const response = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000',
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Failed to retrieve plan',
      })
    })

    it('returns 503 when connection timeout occurs', async () => {
      mockSelectChainError(new Error('connection timeout'))

      const response = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        message: 'Database connection error',
      })
    })
  })

  describe('POST /plans/with-owner - Database Errors', () => {
    it('returns 503 when database connection fails during plan creation', async () => {
      mockDb.transaction.mockRejectedValue(new Error('connect ECONNREFUSED'))

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Alex',
            lastName: 'Guberman',
            contactPhone: '+1-555-123-4567',
          },
        },
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        message: 'Database connection error',
      })
    })

    it('returns 500 when transaction fails with unknown error', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Unknown error'))

      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Alex',
            lastName: 'Guberman',
            contactPhone: '+1-555-123-4567',
          },
        },
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Failed to create plan',
      })
    })
  })
})
