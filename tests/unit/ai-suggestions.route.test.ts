import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { MockLanguageModelV2 } from 'ai/test'
import * as itemSuggestions from '../../src/services/ai/item-suggestions/index.js'
import * as modelProvider from '../../src/services/ai/model-provider.js'
import { aiSuggestionsRoutes } from '../../src/routes/ai-suggestions.route.js'
import { registerSchemas } from '../../src/schemas/index.js'

const VALID_PLAN_ID = '00000000-0000-0000-0000-000000000001'
const FAKE_USER = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  email: 'test@test.com',
  role: 'authenticated' as const,
}
const AUTH_HEADERS = { authorization: 'Bearer fake-jwt-token' }

const FAKE_PLAN_ROW = {
  title: 'Beach trip',
  startDate: new Date('2026-07-01T12:00:00Z'),
  endDate: new Date('2026-07-03T12:00:00Z'),
  location: {
    locationId: 'loc-1',
    name: 'Bondi Beach',
    country: 'Australia',
    region: 'NSW',
    city: 'Sydney',
  },
  tags: ['beach', 'swimming'],
  estimatedAdults: 3,
  estimatedKids: 0,
  defaultLang: null as string | null,
}

const FAKE_SUGGESTIONS = [
  {
    name: 'Sunscreen',
    category: 'personal_equipment',
    subcategory: 'Comfort and Climate Control',
    quantity: 1,
    unit: 'pcs',
    reason: 'Sun protection at the beach',
  },
  {
    name: 'Beach towel',
    category: 'personal_equipment',
    subcategory: 'Comfort and Climate Control',
    quantity: 1,
    unit: 'pcs',
    reason: 'Drying off after swimming',
  },
  {
    name: 'Bottled water',
    category: 'food',
    subcategory: 'Beverages (non-alcoholic)',
    quantity: 6,
    unit: 'l',
    reason: 'Stay hydrated under the sun',
  },
]

function createMockDb() {
  return {
    select: vi.fn(),
    update: vi.fn(),
    query: { plans: { findFirst: vi.fn() } },
  }
}

function createMockModel(suggestions = FAKE_SUGGESTIONS) {
  return new MockLanguageModelV2({
    doGenerate: {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ elements: suggestions }),
        },
      ],
      finishReason: 'stop' as const,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      warnings: [],
    },
  })
}

function mockPlanAccessAllowed(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([
        {
          ...FAKE_PLAN_ROW,
          planId: VALID_PLAN_ID,
          createdByUserId: FAKE_USER.id,
          visibility: 'invite_only',
        },
      ]),
    }),
  })
}

function mockPlanAccessDenied(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  })
}

function mockPlanDataQuery(
  mockDb: ReturnType<typeof createMockDb>,
  plan: typeof FAKE_PLAN_ROW | null
) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(plan ? [plan] : []),
    }),
  })
}

function mockParticipantDietaryQuery(
  mockDb: ReturnType<typeof createMockDb>,
  rows: Array<{ foodPreferences: string | null; dietaryMembers: null }> = []
) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  })
}

function mockAiGenerationIncrement(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })
}

describe('AI Suggestions Route', () => {
  let app: ReturnType<typeof Fastify>
  let mockDb: ReturnType<typeof createMockDb>
  let generateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    mockAiGenerationIncrement(mockDb)
    const model = createMockModel()
    generateSpy = vi.spyOn(itemSuggestions, 'generateItemSuggestions')
    vi.spyOn(modelProvider, 'resolveLanguageModel').mockReturnValue(model)

    app = Fastify({ logger: false })
    app.decorate('db', mockDb)
    app.decorate('aiModel', model)
    app.decorateRequest('user', null)
    app.decorateRequest('sessionId', null)
    app.addHook('onRequest', async (request) => {
      if (request.headers.authorization?.startsWith('Bearer ')) {
        request.user = FAKE_USER
      }
    })
    registerSchemas(app)
    await app.register(aiSuggestionsRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 401 without auth header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 404 when user is not a participant', async () => {
    mockPlanAccessDenied(mockDb)

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns 200 with suggestions on success (defaultLang null -> en)', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.suggestions).toHaveLength(3)
    expect(body.suggestions[0].name).toBe('Sunscreen')
    expect(body.suggestions[0].category).toBe('personal_equipment')
    expect(body.suggestions[2].category).toBe('food')
    expect(generateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Beach trip' }),
      'en'
    )
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('resolves defaultLang=he and passes he to generateItemSuggestions', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, { ...FAKE_PLAN_ROW, defaultLang: 'he' })
    mockParticipantDietaryQuery(mockDb, [])

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
    expect(generateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Beach trip' }),
      'he'
    )
  })

  it('resolves defaultLang=es and passes es to generateItemSuggestions', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, { ...FAKE_PLAN_ROW, defaultLang: 'es' })
    mockParticipantDietaryQuery(mockDb, [])

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
    expect(generateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Beach trip' }),
      'es'
    )
  })

  it('returns correct structure for each suggestion', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })

    const body = response.json()
    for (const item of body.suggestions) {
      expect(item).toHaveProperty('name')
      expect(item).toHaveProperty('category')
      expect(item).toHaveProperty('subcategory')
      expect(item).toHaveProperty('quantity')
      expect(item).toHaveProperty('unit')
      expect(item).toHaveProperty('reason')
    }
  })

  it('returns 503 when AI model throws AI-prefixed error', async () => {
    const failModel = new MockLanguageModelV2({
      doGenerate: () => {
        const err = new Error('Rate limit exceeded')
        err.name = 'AI_APICallError'
        throw err
      },
    })

    vi.mocked(modelProvider.resolveLanguageModel).mockReturnValueOnce(failModel)

    const failDb = createMockDb()
    mockAiGenerationIncrement(failDb)
    const failApp = Fastify({ logger: false })
    failApp.decorate('db', failDb)
    failApp.decorate('aiModel', failModel)
    failApp.decorateRequest('user', null)
    failApp.decorateRequest('sessionId', null)
    failApp.addHook('onRequest', async (request) => {
      if (request.headers.authorization?.startsWith('Bearer ')) {
        request.user = FAKE_USER
      }
    })
    registerSchemas(failApp)
    await failApp.register(aiSuggestionsRoutes)

    mockPlanAccessAllowed(failDb)
    mockPlanDataQuery(failDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(failDb, [])

    const response = await failApp.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().message).toContain('AI service')
    expect(failDb.update).not.toHaveBeenCalled()
    await failApp.close()
  })

  it('returns 500 when non-AI error occurs', async () => {
    mockPlanAccessAllowed(mockDb)
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      }),
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(500)
  })
})
