import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { MockLanguageModelV2 } from 'ai/test'
import * as itemSuggestions from '../../src/services/ai/item-suggestions/index.js'
import * as modelProvider from '../../src/services/ai/model-provider.js'
import * as usageTracking from '../../src/services/ai/usage-tracking.js'
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

const PERSONAL_SUGGESTIONS = [
  {
    name: 'Sunscreen',
    category: 'personal_equipment' as const,
    subcategory: 'Sun Protection',
    quantity: 1,
    unit: 'pcs' as const,
    reason: 'Sun protection at the beach',
  },
  {
    name: 'Beach towel',
    category: 'personal_equipment' as const,
    subcategory: 'Comfort',
    quantity: 1,
    unit: 'pcs' as const,
    reason: 'Drying off after swimming',
  },
]

const GROUP_SUGGESTIONS = [
  {
    name: 'Beach umbrella',
    category: 'group_equipment' as const,
    subcategory: 'Shade',
    quantity: 1,
    unit: 'pcs' as const,
    reason: 'Shade for the group',
  },
]

const FOOD_SUGGESTIONS = [
  {
    name: 'Bottled water',
    category: 'food' as const,
    subcategory: 'Beverages',
    quantity: 6,
    unit: 'l' as const,
    reason: 'Stay hydrated under the sun',
  },
  {
    name: 'Sandwiches',
    category: 'food' as const,
    subcategory: 'Lunch',
    quantity: 6,
    unit: 'pcs' as const,
    reason: 'Easy lunch for the group',
  },
]

function createMockDb() {
  return {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: { plans: { findFirst: vi.fn() } },
  }
}

function mockAiSuggestionsInsert(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockImplementation(() => {
        const count =
          mockDb.insert.mock.calls[mockDb.insert.mock.calls.length - 1]
        void count
        return Promise.resolve(
          Array.from({ length: 5 }, (_, i) => ({ id: `sug-${i}` }))
        )
      }),
    }),
  })
}

function createMockModel(suggestions = PERSONAL_SUGGESTIONS) {
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

interface SseEvent {
  event: string
  data: Record<string, unknown>
}

function parseSseEvents(body: string): SseEvent[] {
  const events: SseEvent[] = []
  const blocks = body.split('\n\n').filter((b) => b.trim())
  for (const block of blocks) {
    const lines = block.split('\n')
    let eventName = ''
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7)
      if (line.startsWith('data: ')) data = line.slice(6)
    }
    if (eventName && data) {
      events.push({ event: eventName, data: JSON.parse(data) })
    }
  }
  return events
}

let usageLogCounter = 0

describe('AI Suggestions Stream Route', () => {
  let app: ReturnType<typeof Fastify>
  let mockDb: ReturnType<typeof createMockDb>
  let generateSpy: ReturnType<typeof vi.spyOn>
  let recordUsageSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    usageLogCounter = 0
    mockDb = createMockDb()
    mockAiGenerationIncrement(mockDb)
    mockAiSuggestionsInsert(mockDb)
    const model = createMockModel()
    generateSpy = vi.spyOn(itemSuggestions, 'generateItemSuggestions')
    vi.spyOn(modelProvider, 'resolveLanguageModel').mockReturnValue(model)
    recordUsageSpy = vi
      .spyOn(usageTracking, 'recordAiUsage')
      .mockImplementation(async () => {
        usageLogCounter++
        return `usage-log-${usageLogCounter}`
      })

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
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 404 when user is not a participant', async () => {
    mockPlanAccessDenied(mockDb)

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })
    expect(response.statusCode).toBe(404)
  })

  it('streams 3 category events + done event on success', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: GROUP_SUGGESTIONS,
        prompt: 'group prompt',
        rawResponseText: JSON.stringify(GROUP_SUGGESTIONS),
        finishReason: 'stop',
        usage: { inputTokens: 90, outputTokens: 30, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: PERSONAL_SUGGESTIONS,
        prompt: 'personal prompt',
        rawResponseText: JSON.stringify(PERSONAL_SUGGESTIONS),
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: FOOD_SUGGESTIONS,
        prompt: 'food prompt',
        rawResponseText: JSON.stringify(FOOD_SUGGESTIONS),
        finishReason: 'stop',
        usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
      })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')

    const events = parseSseEvents(response.body)
    const suggestionEvents = events.filter((e) => e.event === 'suggestions')
    const doneEvents = events.filter((e) => e.event === 'done')

    expect(suggestionEvents).toHaveLength(3)
    expect(doneEvents).toHaveLength(1)

    const categories = suggestionEvents.map((e) => e.data.category).sort()
    expect(categories).toEqual([
      'food',
      'group_equipment',
      'personal_equipment',
    ])

    for (const ev of suggestionEvents) {
      expect(ev.data).toHaveProperty('suggestions')
      expect(ev.data).toHaveProperty('aiUsageLogId')
      expect(Array.isArray(ev.data.suggestions)).toBe(true)
    }

    const done = doneEvents[0].data
    expect(done.totalSuggestions).toBe(5)
    expect(Array.isArray(done.aiUsageLogIds)).toBe(true)
    expect((done.aiUsageLogIds as string[]).length).toBe(3)
    expect(done.errors).toEqual([])
  })

  it('records AI usage for each category call (3 calls)', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: GROUP_SUGGESTIONS,
        prompt: 'p1',
        rawResponseText: 'r1',
        finishReason: 'stop',
        usage: { inputTokens: 90, outputTokens: 30, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: PERSONAL_SUGGESTIONS,
        prompt: 'p2',
        rawResponseText: 'r2',
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: FOOD_SUGGESTIONS,
        prompt: 'p3',
        rawResponseText: 'r3',
        finishReason: 'stop',
        usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
      })

    await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    expect(recordUsageSpy).toHaveBeenCalledTimes(3)

    const metadatas = recordUsageSpy.mock.calls.map(
      (call) => call[1].metadata as Record<string, unknown>
    )
    const streamRequestIds = new Set(metadatas.map((m) => m.streamRequestId))
    expect(streamRequestIds.size).toBe(1)

    const targetCategories = metadatas
      .map((m) => m.targetCategory as string)
      .sort()
    expect(targetCategories).toEqual([
      'food',
      'group_equipment',
      'personal_equipment',
    ])

    for (const m of metadatas) {
      expect(m.streamMode).toBe(true)
    }
  })

  it('streams error event for a failed category while others succeed', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: GROUP_SUGGESTIONS,
        prompt: 'p1',
        rawResponseText: 'r1',
        finishReason: 'stop',
        usage: { inputTokens: 90, outputTokens: 30, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'error' as const,
        suggestions: [],
        prompt: 'p2',
        rawResponseText: null,
        errorType: 'AI_APICallError',
        errorMessage: 'Rate limit exceeded',
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: FOOD_SUGGESTIONS,
        prompt: 'p3',
        rawResponseText: 'r3',
        finishReason: 'stop',
        usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
      })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(200)

    const events = parseSseEvents(response.body)
    const suggestionEvents = events.filter((e) => e.event === 'suggestions')
    const errorEvents = events.filter((e) => e.event === 'error')
    const doneEvents = events.filter((e) => e.event === 'done')

    expect(suggestionEvents).toHaveLength(2)
    expect(errorEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)

    expect(errorEvents[0].data.message).toContain('AI service')

    const done = doneEvents[0].data
    expect(done.totalSuggestions).toBe(3)
    expect((done.errors as string[]).length).toBe(1)
  })

  it('streams only requested categories when body provides category filter', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy.mockResolvedValueOnce({
      status: 'success' as const,
      suggestions: FOOD_SUGGESTIONS,
      prompt: 'food prompt',
      rawResponseText: JSON.stringify(FOOD_SUGGESTIONS),
      finishReason: 'stop',
      usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: { categories: { food: ['Beverages'] } },
    })

    expect(response.statusCode).toBe(200)

    const events = parseSseEvents(response.body)
    const suggestionEvents = events.filter((e) => e.event === 'suggestions')

    expect(suggestionEvents).toHaveLength(1)
    expect(suggestionEvents[0].data.category).toBe('food')
    expect(generateSpy).toHaveBeenCalledTimes(1)
  })

  it('increments aiGenerationCount exactly once', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: GROUP_SUGGESTIONS,
        prompt: 'p1',
        rawResponseText: 'r1',
        finishReason: 'stop',
        usage: { inputTokens: 90, outputTokens: 30, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: PERSONAL_SUGGESTIONS,
        prompt: 'p2',
        rawResponseText: 'r2',
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: FOOD_SUGGESTIONS,
        prompt: 'p3',
        rawResponseText: 'r3',
        finishReason: 'stop',
        usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
      })

    await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('passes focused categories filter to each generateItemSuggestions call', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: GROUP_SUGGESTIONS,
        prompt: 'p',
        rawResponseText: 'r',
        finishReason: 'stop',
        usage: { inputTokens: 90, outputTokens: 30, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: PERSONAL_SUGGESTIONS,
        prompt: 'p',
        rawResponseText: 'r',
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: FOOD_SUGGESTIONS,
        prompt: 'p',
        rawResponseText: 'r',
        finishReason: 'stop',
        usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
      })

    await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    expect(generateSpy).toHaveBeenCalledTimes(3)

    const planContexts = generateSpy.mock.calls.map(
      (call) => call[1] as { categories: Record<string, string[]> }
    )

    const categoryKeys = planContexts
      .map((ctx) => Object.keys(ctx.categories))
      .flat()
      .sort()

    expect(categoryKeys).toEqual([
      'food',
      'group_equipment',
      'personal_equipment',
    ])

    for (const ctx of planContexts) {
      expect(Object.keys(ctx.categories)).toHaveLength(1)
    }
  })

  it('handles partial AI result same as success in stream', async () => {
    mockPlanAccessAllowed(mockDb)
    mockPlanDataQuery(mockDb, FAKE_PLAN_ROW)
    mockParticipantDietaryQuery(mockDb, [])

    generateSpy
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: GROUP_SUGGESTIONS,
        prompt: 'p1',
        rawResponseText: 'r1',
        finishReason: 'stop',
        usage: { inputTokens: 90, outputTokens: 30, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'partial' as const,
        suggestions: [PERSONAL_SUGGESTIONS[0]],
        prompt: 'p2',
        rawResponseText: 'partial raw',
        finishReason: 'length',
        usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      })
      .mockResolvedValueOnce({
        status: 'success' as const,
        suggestions: FOOD_SUGGESTIONS,
        prompt: 'p3',
        rawResponseText: 'r3',
        finishReason: 'stop',
        usage: { inputTokens: 110, outputTokens: 60, totalTokens: 170 },
      })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    const events = parseSseEvents(response.body)
    const suggestionEvents = events.filter((e) => e.event === 'suggestions')
    const errorEvents = events.filter((e) => e.event === 'error')

    expect(suggestionEvents).toHaveLength(3)
    expect(errorEvents).toHaveLength(0)

    const partialEvent = suggestionEvents.find(
      (e) => e.data.category === 'personal_equipment'
    )
    expect((partialEvent!.data.suggestions as unknown[]).length).toBe(1)
  })

  it('returns 500 when plan data fetch throws', async () => {
    mockPlanAccessAllowed(mockDb)
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      }),
    })

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${VALID_PLAN_ID}/ai-suggestions/stream`,
      headers: AUTH_HEADERS,
    })

    expect(response.statusCode).toBe(500)
  })
})
