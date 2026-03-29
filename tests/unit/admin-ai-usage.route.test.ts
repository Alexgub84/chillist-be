import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify from 'fastify'
import { adminAiUsageRoutes } from '../../src/routes/admin-ai-usage.route.js'
import { registerSchemas } from '../../src/schemas/index.js'

const ADMIN_USER = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  email: 'admin@test.com',
  role: 'admin' as const,
}

const NON_ADMIN_USER = {
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  email: 'user@test.com',
  role: 'authenticated' as const,
}

const AUTH_HEADERS = { authorization: 'Bearer fake-jwt-token' }

const FAKE_LOG = {
  id: '11111111-1111-1111-1111-111111111111',
  featureType: 'item_suggestions',
  planId: '22222222-2222-2222-2222-222222222222',
  userId: ADMIN_USER.id,
  provider: 'anthropic',
  modelId: 'claude-haiku-4-5-20251001',
  lang: 'en',
  status: 'success',
  inputTokens: 1500,
  outputTokens: 2500,
  totalTokens: 4000,
  estimatedCost: '0.011200',
  durationMs: 5000,
  promptLength: 1800,
  resultCount: 30,
  errorMessage: null,
  metadata: { planTitle: 'Test plan' },
  createdAt: new Date('2026-03-28T10:00:00Z'),
}

function createQueryChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.from = vi.fn(self)
  chain.where = vi.fn(self)
  chain.orderBy = vi.fn(self)
  chain.limit = vi.fn(self)
  chain.offset = vi.fn(self)
  chain.groupBy = vi.fn(self)
  chain.then = (resolve: (v: unknown) => void) => resolve(resolvedValue)
  return chain
}

function createMockDb(logs = [FAKE_LOG]) {
  let callCount = 0

  const selectFn = vi.fn().mockImplementation(() => {
    callCount++
    switch (callCount) {
      case 1:
        return createQueryChain(logs)
      case 2:
        return createQueryChain([{ count: logs.length }])
      case 3:
        return createQueryChain([
          {
            totalRequests: logs.length,
            totalInputTokens: String(
              logs.reduce((s, l) => s + (l.inputTokens ?? 0), 0)
            ),
            totalOutputTokens: String(
              logs.reduce((s, l) => s + (l.outputTokens ?? 0), 0)
            ),
            totalEstimatedCost:
              logs.length > 0
                ? String(
                    logs.reduce((s, l) => s + Number(l.estimatedCost ?? 0), 0)
                  )
                : null,
          },
        ])
      case 4:
        return createQueryChain(
          logs.length > 0
            ? [
                {
                  featureType: 'item_suggestions',
                  count: logs.length,
                  totalCost: String(
                    logs.reduce((s, l) => s + Number(l.estimatedCost ?? 0), 0)
                  ),
                },
              ]
            : []
        )
      case 5:
        return createQueryChain(
          logs.length > 0
            ? [
                {
                  modelId: 'claude-haiku-4-5-20251001',
                  count: logs.length,
                  totalCost: String(
                    logs.reduce((s, l) => s + Number(l.estimatedCost ?? 0), 0)
                  ),
                },
              ]
            : []
        )
      default:
        return createQueryChain([])
    }
  })

  return { select: selectFn }
}

function buildApp(
  mockDb: ReturnType<typeof createMockDb>,
  user: typeof ADMIN_USER | typeof NON_ADMIN_USER | null = ADMIN_USER
) {
  const app = Fastify({ logger: false })
  app.decorate('db', mockDb)
  app.decorateRequest('user', null)
  app.decorateRequest('sessionId', null)
  app.addHook('onRequest', async (request) => {
    if (request.headers.authorization?.startsWith('Bearer ') && user) {
      request.user = user
    }
  })
  registerSchemas(app)
  return app
}

describe('Admin AI Usage Route', () => {
  let app: ReturnType<typeof Fastify>

  afterEach(async () => {
    if (app) await app.close()
  })

  it('returns 401 without auth header', async () => {
    const mockDb = createMockDb()
    app = buildApp(mockDb, null)
    await app.register(adminAiUsageRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 403 for non-admin user', async () => {
    const mockDb = createMockDb()
    app = buildApp(mockDb, NON_ADMIN_USER)
    await app.register(adminAiUsageRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Admin access required')
  })

  it('returns 200 with logs and summary for admin', async () => {
    const mockDb = createMockDb()
    app = buildApp(mockDb, ADMIN_USER)
    await app.register(adminAiUsageRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveProperty('logs')
    expect(body).toHaveProperty('total', 1)
    expect(body).toHaveProperty('summary')
    expect(body.summary.totalRequests).toBe(1)
    expect(body.summary.totalInputTokens).toBe(1500)
    expect(body.summary.totalOutputTokens).toBe(2500)
    expect(body.summary.byFeature).toHaveLength(1)
    expect(body.summary.byFeature[0].featureType).toBe('item_suggestions')
    expect(body.summary.byModel).toHaveLength(1)
    expect(body.summary.byModel[0].modelId).toBe('claude-haiku-4-5-20251001')
  })

  it('returns empty result when no logs exist', async () => {
    const mockDb = createMockDb([])
    app = buildApp(mockDb, ADMIN_USER)
    await app.register(adminAiUsageRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.logs).toEqual([])
    expect(body.total).toBe(0)
    expect(body.summary.totalRequests).toBe(0)
    expect(body.summary.byFeature).toEqual([])
    expect(body.summary.byModel).toEqual([])
  })

  it('passes query filters to the database', async () => {
    const mockDb = createMockDb()
    app = buildApp(mockDb, ADMIN_USER)
    await app.register(adminAiUsageRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage?featureType=item_suggestions&status=success&limit=10&offset=5',
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 500 when the database query fails', async () => {
    const dbError = new Error('DB connection lost')
    const rejectingChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      then: (_resolve: (v: unknown) => void, reject: (e: Error) => void) => {
        reject(dbError)
      },
    }
    const failingDb = {
      select: vi.fn().mockReturnValue(rejectingChain),
    }
    app = buildApp(failingDb as never, ADMIN_USER)
    await app.register(adminAiUsageRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(500)
    expect(response.json().message).toBe('Failed to retrieve AI usage logs')
  })
})
