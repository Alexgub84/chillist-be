import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  closeTestDatabase,
  getTestDb,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import {
  plans,
  participants,
  aiUsageLogs,
  aiSuggestions,
  type ItemCategory,
} from '../../src/db/schema.js'
import * as itemSuggestions from '../../src/services/ai/item-suggestions/index.js'
import type { ItemSuggestionsResult } from '../../src/services/ai/item-suggestions/generate.js'

const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-4444aaaaaaaa'
const OTHER_USER_ID = 'bbbbbbbb-1111-2222-3333-4444bbbbbbbb'

function successResult(
  category: ItemCategory,
  overrides: Partial<ItemSuggestionsResult> = {}
): ItemSuggestionsResult {
  return {
    status: 'success',
    suggestions: [
      {
        name: `${category} item 1`,
        category,
        subcategory: 'General',
        quantity: 1,
        unit: 'pcs',
        reason: `Useful for ${category}`,
      },
    ],
    prompt: `prompt for ${category}`,
    rawResponseText: `[${category}]`,
    finishReason: 'stop',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    ...overrides,
  } as ItemSuggestionsResult
}

function errorResult(): ItemSuggestionsResult {
  return {
    status: 'error',
    suggestions: [],
    prompt: 'failed prompt',
    rawResponseText: null,
    errorType: 'AI_APICallError',
    errorMessage: 'Upstream model unavailable',
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
  } as ItemSuggestionsResult
}

async function seedPlanWithOwner(opts: {
  ownerUserId: string
  defaultLang?: 'en' | 'he' | 'es'
}) {
  const db = await getTestDb()
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Weekend camping',
      status: 'active',
      visibility: 'invite_only',
      createdByUserId: opts.ownerUserId,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-03'),
      estimatedAdults: 2,
      estimatedKids: 1,
      tags: ['camping'],
      location: {
        locationId: 'loc-1',
        name: 'Ein Gedi',
        city: 'Ein Gedi',
        country: 'Israel',
      },
      defaultLang: opts.defaultLang ?? 'en',
    })
    .returning()

  await db.insert(participants).values({
    planId: plan.planId,
    name: 'Owner',
    lastName: 'User',
    contactPhone: '+15550001111',
    role: 'owner',
    userId: opts.ownerUserId,
    inviteToken: randomBytes(32).toString('hex'),
    rsvpStatus: 'confirmed',
  })

  return plan
}

async function cleanupRows(planId: string) {
  const db = await getTestDb()
  await db.delete(aiSuggestions).where(eq(aiSuggestions.planId, planId))
  await db.delete(aiUsageLogs).where(eq(aiUsageLogs.planId, planId))
  await db.delete(participants).where(eq(participants.planId, planId))
  await db.delete(plans).where(eq(plans.planId, planId))
}

type GenerateFn = typeof itemSuggestions.generateItemSuggestions

describe('AI Suggestions Route — per-category REST', () => {
  let app: FastifyInstance
  let ownerToken: string
  let otherToken: string
  let generateSpy: import('vitest').MockInstance<GenerateFn>

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
    otherToken = await signTestJwt({ sub: OTHER_USER_ID })

    const { buildApp } = await import('../../src/app.js')
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(() => {
    generateSpy = vi.spyOn(
      itemSuggestions as unknown as { generateItemSuggestions: GenerateFn },
      'generateItemSuggestions'
    )
    generateSpy.mockImplementation(async (_model, plan) => {
      const categoryKeys = Object.keys(plan.categories ?? {})
      const category = (categoryKeys[0] ?? 'group_equipment') as ItemCategory
      return successResult(category)
    })
  })

  describe('auth', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          payload: {},
        })
        expect(response.statusCode).toBe(401)
      } finally {
        await cleanupRows(plan.planId)
      }
    })
  })

  describe('access control', () => {
    it('returns 404 when plan does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/plans/${randomUUID()}/ai-suggestions/food`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when user is not a participant', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${otherToken}` },
          payload: {},
        })
        expect(response.statusCode).toBe(404)
      } finally {
        await cleanupRows(plan.planId)
      }
    })
  })

  describe('validation', () => {
    it('returns 400 for invalid category path segment', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/not_a_category`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })
        expect(response.statusCode).toBe(400)
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('returns 400 when X-Generation-Id is not a UUID', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'x-generation-id': 'not-a-uuid',
          },
          payload: {},
        })
        expect(response.statusCode).toBe(400)
      } finally {
        await cleanupRows(plan.planId)
      }
    })
  })

  describe('happy path', () => {
    it('returns 200 with suggestions, aiUsageLogId and generationId', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })

        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(Array.isArray(body.suggestions)).toBe(true)
        expect(body.suggestions.length).toBeGreaterThanOrEqual(1)
        for (const item of body.suggestions) {
          expect(item.category).toBe('food')
        }
        expect(typeof body.aiUsageLogId).toBe('string')
        expect(body.aiUsageLogId.length).toBeGreaterThan(0)
        expect(typeof body.generationId).toBe('string')
        expect(body.generationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('persists ai_usage_logs.metadata.generationId equal to X-Generation-Id header', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      const generationId = randomUUID()
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/group_equipment`,
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'x-generation-id': generationId,
          },
          payload: {},
        })

        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(body.generationId).toBe(generationId)

        const db = await getTestDb()
        const [row] = await db
          .select()
          .from(aiUsageLogs)
          .where(eq(aiUsageLogs.id, body.aiUsageLogId))
        expect(row).toBeDefined()
        const meta = row!.metadata as Record<string, unknown>
        expect(meta.generationId).toBe(generationId)
        expect(meta.targetCategory).toBe('group_equipment')
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('generates a fallback UUID when X-Generation-Id header is missing', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/personal_equipment`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })

        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(body.generationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )

        const db = await getTestDb()
        const [row] = await db
          .select()
          .from(aiUsageLogs)
          .where(eq(aiUsageLogs.id, body.aiUsageLogId))
        const meta = row!.metadata as Record<string, unknown>
        expect(meta.generationId).toBe(body.generationId)
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('forwards subcategories from body into the plan context', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: { subcategories: ['breakfast', 'snacks'] },
        })
        expect(response.statusCode).toBe(200)

        expect(generateSpy).toHaveBeenCalledTimes(1)
        const [, passedPlan] = generateSpy.mock.calls[0]
        expect(passedPlan.categories).toEqual({
          food: ['breakfast', 'snacks'],
        })
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('treats body null and absent subcategories identically', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const r1 = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })
        expect(r1.statusCode).toBe(200)
        const call1Plan = generateSpy.mock.calls[0]?.[1]

        const r2 = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
        })
        expect(r2.statusCode).toBe(200)
        const call2Plan = generateSpy.mock.calls[1]?.[1]

        expect(call1Plan.categories).toEqual({ food: [] })
        expect(call2Plan.categories).toEqual({ food: [] })
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('filters out AI-returned items whose category differs from the requested one', async () => {
      generateSpy.mockImplementationOnce(async () => {
        return {
          status: 'success',
          suggestions: [
            {
              name: 'Apple',
              category: 'food',
              subcategory: 'Fruit',
              quantity: 4,
              unit: 'pcs',
              reason: 'snack',
            },
            {
              name: 'Tent',
              category: 'group_equipment',
              subcategory: 'Shelter',
              quantity: 1,
              unit: 'pcs',
              reason: 'leaked in',
            },
          ],
          prompt: 'p',
          rawResponseText: '[]',
          finishReason: 'stop',
          usage: {
            inputTokens: 10,
            outputTokens: 10,
            totalTokens: 20,
          },
        } as ItemSuggestionsResult
      })

      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })

        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(body.suggestions).toHaveLength(1)
        expect(body.suggestions[0].category).toBe('food')
        expect(body.suggestions[0].name).toBe('Apple')
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('increments plans.aiGenerationCount by 1 per call', async () => {
      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const db = await getTestDb()
        const [before] = await db
          .select({ count: plans.aiGenerationCount })
          .from(plans)
          .where(eq(plans.planId, plan.planId))

        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })
        expect(response.statusCode).toBe(200)

        const [after] = await db
          .select({ count: plans.aiGenerationCount })
          .from(plans)
          .where(eq(plans.planId, plan.planId))

        expect(after.count).toBe((before.count ?? 0) + 1)
      } finally {
        await cleanupRows(plan.planId)
      }
    })

    it('resolves language from plan.defaultLang', async () => {
      const plan = await seedPlanWithOwner({
        ownerUserId: OWNER_USER_ID,
        defaultLang: 'he',
      })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })
        expect(response.statusCode).toBe(200)
        const body = response.json()

        const db = await getTestDb()
        const [row] = await db
          .select()
          .from(aiUsageLogs)
          .where(eq(aiUsageLogs.id, body.aiUsageLogId))
        expect(row!.lang).toBe('he')

        expect(generateSpy).toHaveBeenCalled()
        const langArg = generateSpy.mock.calls[0]?.[2]
        expect(langArg).toBe('he')
      } finally {
        await cleanupRows(plan.planId)
      }
    })
  })

  describe('AI error path', () => {
    it('returns 502 when generateItemSuggestions returns status=error and records usage with status=error', async () => {
      generateSpy.mockImplementationOnce(async () => errorResult())

      const plan = await seedPlanWithOwner({ ownerUserId: OWNER_USER_ID })
      try {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/ai-suggestions/food`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {},
        })

        expect(response.statusCode).toBe(502)
        const body = response.json()
        expect(body.message).toContain('AI service')

        const db = await getTestDb()
        const rows = await db
          .select()
          .from(aiUsageLogs)
          .where(eq(aiUsageLogs.planId, plan.planId))
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('error')
        expect(rows[0].errorType).toBe('AI_APICallError')
      } finally {
        await cleanupRows(plan.planId)
      }
    })
  })
})
