/**
 * AI Suggestions E2E tests — SKIPPED when no AI API key is present.
 *
 * These tests call the REAL AI API through the full route stack (auth, DB,
 * AI usage logging). Run them manually from repo root:
 *
 *   npm run test:ai-suggestions-e2e
 *
 * Requires a .env file (or shell env) with AI_PROVIDER and the matching key:
 *   - anthropic (default): ANTHROPIC_API_KEY
 *   - openai: OPENAI_API_KEY
 *
 * After each run a result file is written to logs/ai-suggestions-e2e-<ts>.json
 * so you can inspect the AI output without re-running the suite.
 *
 * What these tests cover (that unit tests do NOT):
 *   - Real AI model responds and returns valid suggestion structure
 *   - AI usage is recorded to the aiUsageLogs DB table (promptText, tokens, etc.)
 *   - AI suggestions are persisted to the aiSuggestions DB table
 *   - The full dietary context (vegan + gluten-free + allergy) reaches the prompt
 *   - Category filter (all 3 categories): only items in requested categories are returned
 *
 * Plan used for all tests (maximally rich, mirrors FE wizard output):
 *   Title    : Family beach camping trip
 *   Location : Dor Beach, North District, Israel
 *   Tags     : camping, beach, swimming, cooking, bbq, kids
 *   Adults   : 4   Kids: 2
 *   Dietary  :
 *     Participant 1 (owner)  — vegan, nut allergy
 *     Participant 2          — gluten-free, no allergy
 *     Participant 3          — everything, dairy allergy
 *     Participant 4          — everything, no allergy (kid)
 *
 * Categories used in filter tests mirror what the FE wizard sends:
 *   all three top-level categories always present.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { closeTestDatabase, setupTestDatabase } from '../helpers/db.js'
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
} from '../../src/db/schema.js'
import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../../src/db/schema.js'
import type { DietaryMembers } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'

function loadEnvFile() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env file not found
  }
}

type ScenarioResult = {
  scenario: string
  suggestions: unknown[]
  inputTokens?: number
  outputTokens?: number
  resultCount: number
}

function writeResultFile(results: ScenarioResult[]) {
  const logsDir = resolve(process.cwd(), 'logs')
  mkdirSync(logsDir, { recursive: true })
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19)
  const filePath = resolve(logsDir, `ai-suggestions-e2e-${ts}.json`)
  writeFileSync(
    filePath,
    JSON.stringify({ runAt: new Date().toISOString(), results }, null, 2)
  )
  console.log(`\nResult file written → ${filePath}\n`)
}

loadEnvFile()

const provider = process.env.AI_PROVIDER ?? 'anthropic'
const hasRealApiKey =
  provider === 'openai'
    ? Boolean(process.env.OPENAI_API_KEY?.trim())
    : Boolean(process.env.ANTHROPIC_API_KEY?.trim())

const OWNER_USER_ID = 'aaaaaaaa-e2e0-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// Test plan data — mirrors a fully-filled FE wizard submission
// ---------------------------------------------------------------------------

const PLAN_DATA = {
  title: 'Family beach camping trip',
  status: 'active' as const,
  visibility: 'invite_only' as const,
  createdByUserId: OWNER_USER_ID,
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-04'),
  estimatedAdults: 4,
  estimatedKids: 2,
  tags: ['camping', 'beach', 'swimming', 'cooking', 'bbq', 'kids'],
  location: {
    locationId: 'loc-e2e-1',
    name: 'Dor Beach',
    city: 'Dor',
    region: 'North District',
    country: 'Israel',
  },
  defaultLang: 'en',
}

// Participant dietary data mirrors the FE dietaryMembers structure
const PARTICIPANT_DIETARY: Array<{
  name: string
  role: 'owner' | 'participant'
  userId?: string
  dietaryMembers: DietaryMembers
}> = [
  {
    name: 'Alex (owner)',
    role: 'owner',
    userId: OWNER_USER_ID,
    dietaryMembers: {
      members: [
        { type: 'adult', index: 0, diet: 'vegan', allergies: ['nuts'] },
      ],
    },
  },
  {
    name: 'Dana',
    role: 'participant',
    dietaryMembers: {
      members: [
        {
          type: 'adult',
          index: 0,
          diet: 'gluten_free',
          allergies: ['none'],
        },
      ],
    },
  },
  {
    name: 'Sam',
    role: 'participant',
    dietaryMembers: {
      members: [
        { type: 'adult', index: 0, diet: 'everything', allergies: ['dairy'] },
      ],
    },
  },
  {
    name: 'Roni (kid)',
    role: 'participant',
    dietaryMembers: {
      members: [
        { type: 'kid', index: 0, diet: 'everything', allergies: ['none'] },
      ],
    },
  },
]

// ---------------------------------------------------------------------------
// All three categories with representative subcategories — as the FE sends
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = {
  group_equipment: [
    'Sleeping Gear',
    'Cooking and Heating Equipment',
    'Venue Setup and Layout',
    'First Aid and Safety',
    'Food Storage and Cooling',
  ],
  personal_equipment: [
    'Clothing',
    'Comfort and Climate Control',
    'Hygiene and Personal Care',
  ],
  food: [
    'Snacks and Chips',
    'Breakfast Staples',
    'Meat and Proteins',
    'Vegan',
    'Fresh Produce',
    'Beverages (non-alcoholic)',
  ],
}

describe.skipIf(!hasRealApiKey)('AI Suggestions E2E — Real AI Model', () => {
  let app: FastifyInstance
  let ownerToken: string
  let db: Awaited<ReturnType<typeof setupTestDatabase>>
  let planId: string
  const scenarioResults: ScenarioResult[] = []

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()
    ownerToken = await signTestJwt({ sub: OWNER_USER_ID })

    const [plan] = await db.insert(plans).values(PLAN_DATA).returning()
    planId = plan.planId

    await db.insert(participants).values(
      PARTICIPANT_DIETARY.map((p, i) => ({
        planId,
        name: p.name,
        lastName: 'Participant',
        contactPhone: `+97250000000${i + 1}`,
        role: p.role,
        ...(p.userId ? { userId: p.userId } : {}),
        inviteToken: randomBytes(32).toString('hex'),
        rsvpStatus: 'confirmed' as const,
        dietaryMembers: p.dietaryMembers,
      }))
    )

    const { buildApp } = await import('../../src/app.js')
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  }, 60000)

  afterAll(async () => {
    writeResultFile(scenarioResults)
    await app.close()
    await closeTestDatabase()
  })

  // -------------------------------------------------------------------------
  // Scenario 1 — No category filter, full context
  // -------------------------------------------------------------------------
  it('returns suggestions with valid structure and records AI usage to DB', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/ai-suggestions`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()

    // Response shape
    expect(body).toHaveProperty('aiUsageLogId')
    expect(body.aiUsageLogId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(Array.isArray(body.suggestions)).toBe(true)
    expect(body.suggestions.length).toBeGreaterThanOrEqual(5)

    for (const item of body.suggestions) {
      expect(item).toHaveProperty('id')
      expect(ITEM_CATEGORY_VALUES).toContain(item.category)
      expect(UNIT_VALUES).toContain(item.unit)
      expect(typeof item.name).toBe('string')
      expect(item.name.trim().length).toBeGreaterThan(0)
      expect(typeof item.subcategory).toBe('string')
      expect(item.subcategory.trim().length).toBeGreaterThan(0)
      expect(typeof item.quantity).toBe('number')
      expect(item.quantity).toBeGreaterThan(0)
      expect(typeof item.reason).toBe('string')
      expect(item.reason.trim().length).toBeGreaterThan(0)
    }

    // AI usage log was written to DB
    const [usageLog] = await db
      .select()
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.id, body.aiUsageLogId))

    expect(usageLog).toBeDefined()
    expect(usageLog.planId).toBe(planId)
    expect(usageLog.featureType).toBe('item_suggestions')
    expect(usageLog.status).toBe('success')
    expect(usageLog.promptText).toBeTruthy()
    expect(Number(usageLog.inputTokens)).toBeGreaterThan(0)
    expect(Number(usageLog.outputTokens)).toBeGreaterThan(0)
    expect(usageLog.resultCount).toBe(body.suggestions.length)

    // AI suggestions were persisted to DB
    const stored = await db
      .select()
      .from(aiSuggestions)
      .where(eq(aiSuggestions.planId, planId))

    expect(stored.length).toBe(body.suggestions.length)

    scenarioResults.push({
      scenario: 'no-filter — full context',
      suggestions: body.suggestions,
      inputTokens: Number(usageLog.inputTokens),
      outputTokens: Number(usageLog.outputTokens),
      resultCount: body.suggestions.length,
    })
  }, 60000)

  // -------------------------------------------------------------------------
  // Scenario 2 — All three categories with subcategories (FE wizard output)
  //              Also verifies dietary context reached the prompt
  // -------------------------------------------------------------------------
  it('returns items across all three categories and prompt includes dietary context', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/ai-suggestions`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'content-type': 'application/json',
      },
      payload: { categories: ALL_CATEGORIES },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()

    expect(body.suggestions.length).toBeGreaterThanOrEqual(5)

    // Every item must belong to one of the three requested categories
    for (const item of body.suggestions) {
      expect(['group_equipment', 'personal_equipment', 'food']).toContain(
        item.category
      )
    }

    // All three categories must be represented
    const returnedCategories = new Set(
      body.suggestions.map((s: { category: string }) => s.category)
    )
    expect(returnedCategories.has('group_equipment')).toBe(true)
    expect(returnedCategories.has('personal_equipment')).toBe(true)
    expect(returnedCategories.has('food')).toBe(true)

    // The usage log prompt must contain the dietary summary from participants
    const [usageLog] = await db
      .select()
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.id, body.aiUsageLogId))

    expect(usageLog.promptText).toMatch(/vegan|gluten|allerg/i)

    scenarioResults.push({
      scenario: 'all-categories — full category filter + dietary context',
      suggestions: body.suggestions,
      inputTokens: Number(usageLog.inputTokens),
      outputTokens: Number(usageLog.outputTokens),
      resultCount: body.suggestions.length,
    })
  }, 60000)
})
