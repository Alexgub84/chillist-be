import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { itemsRoutes } from '../../src/routes/items.route.js'
import { registerSchemas } from '../../src/schemas/index.js'

const VALID_UUID = '00000000-0000-0000-0000-000000000000'

function createMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
  }
}

function mockSelectPlanFound(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ planId: VALID_UUID }]),
    }),
  })
}

function mockInsertError(
  mockDb: ReturnType<typeof createMockDb>,
  error: unknown
) {
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockRejectedValue(error),
    }),
  })
}

const validEquipmentPayload = {
  name: 'Tent',
  category: 'equipment',
  quantity: 1,
  status: 'pending',
}

describe('Items Route - Error Scenarios', () => {
  let app: ReturnType<typeof Fastify>
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDb = createMockDb()

    app = Fastify({ logger: false })
    app.decorate('db', mockDb)
    registerSchemas(app)
    await app.register(itemsRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /plans/:planId/items - Plan Lookup Errors', () => {
    it.each([
      ['connect ECONNREFUSED', 503, 'Database connection error'],
      ['connection timeout', 503, 'Database connection error'],
      ['Unknown database error', 500, 'Failed to create item'],
    ])(
      'returns correct status when plan lookup fails with "%s"',
      async (errorMessage, expectedStatus, expectedMessage) => {
        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockRejectedValue(new Error(errorMessage)),
          }),
        })

        const response = await app.inject({
          method: 'POST',
          url: `/plans/${VALID_UUID}/items`,
          payload: validEquipmentPayload,
        })

        expect(response.statusCode).toBe(expectedStatus)
        expect(response.json()).toEqual({ message: expectedMessage })
      }
    )

    it('returns 500 when non-Error is thrown on plan lookup', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue('string error'),
        }),
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${VALID_UUID}/items`,
        payload: validEquipmentPayload,
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ message: 'Failed to create item' })
    })
  })

  describe('POST /plans/:planId/items - Insert Errors', () => {
    it.each([
      ['connect ECONNREFUSED', 503, 'Database connection error'],
      ['connection timeout', 503, 'Database connection error'],
      ['Unknown database error', 500, 'Failed to create item'],
    ])(
      'returns correct status when item insert fails with "%s"',
      async (errorMessage, expectedStatus, expectedMessage) => {
        mockSelectPlanFound(mockDb)
        mockInsertError(mockDb, new Error(errorMessage))

        const response = await app.inject({
          method: 'POST',
          url: `/plans/${VALID_UUID}/items`,
          payload: validEquipmentPayload,
        })

        expect(response.statusCode).toBe(expectedStatus)
        expect(response.json()).toEqual({ message: expectedMessage })
      }
    )

    it('returns 500 when non-Error is thrown on item insert', async () => {
      mockSelectPlanFound(mockDb)
      mockInsertError(mockDb, 'string error')

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${VALID_UUID}/items`,
        payload: validEquipmentPayload,
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ message: 'Failed to create item' })
    })
  })
})
