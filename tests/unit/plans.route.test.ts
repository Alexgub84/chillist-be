import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  schema: {
    plans: {},
  },
}))

import { plansRoutes } from '../../src/routes/plans.route.js'
import { db } from '../../src/db/index.js'

describe('Plans Route - Error Scenarios', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify({ logger: false })
    await app.register(plansRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /plans - Database Errors', () => {
    it('returns 503 when database connection fails', async () => {
      const mockSelect = vi.mocked(db.select)
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
        }),
      } as never)

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
      const mockSelect = vi.mocked(db.select)
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi
            .fn()
            .mockRejectedValue(new Error('Unknown database error')),
        }),
      } as never)

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
      const mockSelect = vi.mocked(db.select)
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue('string error'),
        }),
      } as never)

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
      const mockSelect = vi.mocked(db.select)
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error('connection timeout')),
        }),
      } as never)

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
