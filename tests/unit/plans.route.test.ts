import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { plansRoutes } from '../../src/routes/plans.route.js'

function createMockDb() {
  return {
    select: vi.fn(),
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
    await app.register(plansRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /plans - Database Errors', () => {
    it('returns 503 when database connection fails', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
        }),
      })

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
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi
            .fn()
            .mockRejectedValue(new Error('Unknown database error')),
        }),
      })

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
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue('string error'),
        }),
      })

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
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error('connection timeout')),
        }),
      })

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
})
