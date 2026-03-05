import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { itemsRoutes } from '../../src/routes/items.route.js'
import { registerSchemas } from '../../src/schemas/index.js'

const VALID_UUID = '00000000-0000-0000-0000-000000000000'
const FAKE_USER = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  email: 'test@test.com',
  role: 'authenticated' as const,
}
const AUTH_HEADERS = { authorization: 'Bearer fake-jwt-token' }

function createMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
}

function mockAccessCheckWithError(
  mockDb: ReturnType<typeof createMockDb>,
  error: unknown
) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(error),
      }),
    }),
  })
}

function mockAccessCheckSuccess(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue([{ participantId: VALID_UUID, role: 'owner' }]),
      }),
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
}

describe('Items Route - Error Scenarios', () => {
  let app: ReturnType<typeof Fastify>
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDb = createMockDb()

    app = Fastify({ logger: false })
    app.decorate('db', mockDb)
    app.decorateRequest('user', null)
    app.addHook('onRequest', async (request) => {
      if (request.headers.authorization?.startsWith('Bearer ')) {
        request.user = FAKE_USER
      }
    })
    registerSchemas(app)
    await app.register(itemsRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /plans/:planId/items - Access Check Errors', () => {
    it.each([
      ['connect ECONNREFUSED', 503, 'Database connection error'],
      ['connection timeout', 503, 'Database connection error'],
      ['Unknown database error', 500, 'Failed to create item'],
    ])(
      'returns correct status when access check fails with "%s"',
      async (errorMessage, expectedStatus, expectedMessage) => {
        mockAccessCheckWithError(mockDb, new Error(errorMessage))

        const response = await app.inject({
          method: 'POST',
          url: `/plans/${VALID_UUID}/items`,
          headers: AUTH_HEADERS,
          payload: validEquipmentPayload,
        })

        expect(response.statusCode).toBe(expectedStatus)
        expect(response.json()).toEqual({ message: expectedMessage })
      }
    )

    it('returns 500 when non-Error is thrown on access check', async () => {
      mockAccessCheckWithError(mockDb, 'string error')

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${VALID_UUID}/items`,
        headers: AUTH_HEADERS,
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
        mockAccessCheckSuccess(mockDb)
        mockInsertError(mockDb, new Error(errorMessage))

        const response = await app.inject({
          method: 'POST',
          url: `/plans/${VALID_UUID}/items`,
          headers: AUTH_HEADERS,
          payload: validEquipmentPayload,
        })

        expect(response.statusCode).toBe(expectedStatus)
        expect(response.json()).toEqual({ message: expectedMessage })
      }
    )

    it('returns 500 when non-Error is thrown on item insert', async () => {
      mockAccessCheckSuccess(mockDb)
      mockInsertError(mockDb, 'string error')

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${VALID_UUID}/items`,
        headers: AUTH_HEADERS,
        payload: validEquipmentPayload,
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ message: 'Failed to create item' })
    })
  })
})
