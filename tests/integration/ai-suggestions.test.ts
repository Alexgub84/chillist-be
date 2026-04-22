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

const OWNER_USER_ID = 'aaaaaaaa-2222-3333-4444-5555aaaaaaaa'

function makeSuccess(category: ItemCategory): ItemSuggestionsResult {
  return {
    status: 'success',
    suggestions: [
      {
        name: `${category} A`,
        category,
        subcategory: 'General',
        quantity: 1,
        unit: 'pcs',
        reason: `r-${category}`,
      },
      {
        name: `${category} B`,
        category,
        subcategory: 'General',
        quantity: 2,
        unit: 'pcs',
        reason: `r2-${category}`,
      },
    ],
    prompt: `prompt-${category}`,
    rawResponseText: `raw-${category}`,
    finishReason: 'stop',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  } as ItemSuggestionsResult
}

async function seedPlan(): Promise<string> {
  const db = await getTestDb()
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Integration Plan',
      status: 'active',
      visibility: 'invite_only',
      createdByUserId: OWNER_USER_ID,
      startDate: new Date('2026-10-10'),
      endDate: new Date('2026-10-12'),
      estimatedAdults: 2,
      estimatedKids: 0,
      tags: ['beach'],
      location: { locationId: 'loc', name: 'Tel Aviv', country: 'Israel' },
      defaultLang: 'en',
    })
    .returning({ planId: plans.planId })

  await db.insert(participants).values({
    planId: plan.planId,
    name: 'Owner',
    lastName: 'User',
    contactPhone: '+15550004444',
    role: 'owner',
    userId: OWNER_USER_ID,
    inviteToken: randomBytes(32).toString('hex'),
    rsvpStatus: 'confirmed',
  })

  return plan.planId
}

async function cleanupPlan(planId: string) {
  const db = await getTestDb()
  await db.delete(aiSuggestions).where(eq(aiSuggestions.planId, planId))
  await db.delete(aiUsageLogs).where(eq(aiUsageLogs.planId, planId))
  await db.delete(participants).where(eq(participants.planId, planId))
  await db.delete(plans).where(eq(plans.planId, planId))
}

describe('AI Suggestions — Integration (per-category REST)', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    token = await signTestJwt({ sub: OWNER_USER_ID })

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
    vi.spyOn(itemSuggestions, 'generateItemSuggestions').mockImplementation(
      async (_model, plan) => {
        const category = (Object.keys(plan.categories ?? {})[0] ??
          'food') as ItemCategory
        await new Promise((r) => setTimeout(r, 20))
        return makeSuccess(category)
      }
    )
  })

  it('3 parallel calls with one shared X-Generation-Id persist 3 usage rows and 3 batches', async () => {
    const planId = await seedPlan()
    const generationId = randomUUID()
    try {
      const categories: ItemCategory[] = [
        'food',
        'group_equipment',
        'personal_equipment',
      ]

      const responses = await Promise.all(
        categories.map((c) =>
          app.inject({
            method: 'POST',
            url: `/plans/${planId}/ai-suggestions/${c}`,
            headers: {
              authorization: `Bearer ${token}`,
              'x-generation-id': generationId,
            },
            payload: {},
          })
        )
      )

      for (const r of responses) {
        expect(r.statusCode).toBe(200)
        const body = r.json()
        expect(body.generationId).toBe(generationId)
      }

      const db = await getTestDb()
      const logs = await db
        .select()
        .from(aiUsageLogs)
        .where(eq(aiUsageLogs.planId, planId))
      expect(logs).toHaveLength(3)
      for (const log of logs) {
        const meta = log.metadata as Record<string, unknown>
        expect(meta.generationId).toBe(generationId)
        expect(['food', 'group_equipment', 'personal_equipment']).toContain(
          meta.targetCategory
        )
      }

      const suggestionsRows = await db
        .select()
        .from(aiSuggestions)
        .where(eq(aiSuggestions.planId, planId))
      expect(suggestionsRows).toHaveLength(6)

      const suggestionCategories = suggestionsRows.map((s) => s.category).sort()
      expect(suggestionCategories).toEqual([
        'food',
        'food',
        'group_equipment',
        'group_equipment',
        'personal_equipment',
        'personal_equipment',
      ])

      const [planRow] = await db
        .select({ count: plans.aiGenerationCount })
        .from(plans)
        .where(eq(plans.planId, planId))
      expect(planRow.count).toBe(3)
    } finally {
      await cleanupPlan(planId)
    }
  })

  it('persists ai_suggestions linked to the returned aiUsageLogId', async () => {
    const planId = await seedPlan()
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/ai-suggestions/food`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()

      const db = await getTestDb()
      const rows = await db
        .select()
        .from(aiSuggestions)
        .where(eq(aiSuggestions.aiUsageLogId, body.aiUsageLogId))
      expect(rows.length).toBe(body.suggestions.length)
      for (const row of rows) {
        expect(row.category).toBe('food')
        expect(row.planId).toBe(planId)
      }
    } finally {
      await cleanupPlan(planId)
    }
  })

  it('CORS smoke: origin request returns Access-Control-Allow-Origin header', async () => {
    const planId = await seedPlan()
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/ai-suggestions/food`,
        headers: {
          authorization: `Bearer ${token}`,
          origin: 'http://localhost:5173',
        },
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeDefined()
    } finally {
      await cleanupPlan(planId)
    }
  })
})
