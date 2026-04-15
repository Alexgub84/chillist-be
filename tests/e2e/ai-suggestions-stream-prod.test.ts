/**
 * AI Suggestions STREAM E2E tests — SKIPPED when no AI API key is present.
 *
 * These tests call the REAL AI API through the full streaming route stack
 * (auth, DB, parallel AI calls, SSE events, AI usage logging).
 *
 * Run manually:
 *   npm run test:ai-suggestions-stream-e2e
 *
 * Requires .env with AI_PROVIDER and the matching key:
 *   - anthropic (default): ANTHROPIC_API_KEY
 *   - openai: OPENAI_API_KEY
 *
 * After each run a result file is written to logs/ai-suggestions-stream-e2e-<ts>.json
 *
 * What these tests cover (that unit tests do NOT):
 *   - Real AI model responds for each category independently
 *   - SSE events arrive with valid structure per category
 *   - AI usage logs written with shared streamRequestId metadata
 *   - AI suggestions persisted per category to aiSuggestions table
 *   - Comparison logging: streaming (3 calls) vs non-streaming (1 call)
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
  ITEM_CATEGORY_VALUES,
  UNIT_VALUES,
} from '../../src/db/schema.js'
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

type ScenarioResult = {
  scenario: string
  mode: 'stream' | 'single'
  categories: string[]
  totalItems: number
  inputTokens: number
  outputTokens: number
  durationMs: number
}

function writeResultFile(results: ScenarioResult[]) {
  const logsDir = resolve(process.cwd(), 'logs')
  mkdirSync(logsDir, { recursive: true })
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19)
  const filePath = resolve(logsDir, `ai-suggestions-stream-e2e-${ts}.json`)
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

const OWNER_USER_ID = 'aaaaaaaa-e2e0-0000-0000-000000000002'

const PLAN_DATA = {
  title: 'Family beach camping trip (stream test)',
  status: 'active' as const,
  visibility: 'invite_only' as const,
  createdByUserId: OWNER_USER_ID,
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-04'),
  estimatedAdults: 4,
  estimatedKids: 2,
  tags: ['camping', 'beach', 'swimming', 'cooking', 'bbq', 'kids'],
  location: {
    locationId: 'loc-e2e-stream-1',
    name: 'Dor Beach',
    city: 'Dor',
    region: 'North District',
    country: 'Israel',
  },
  defaultLang: 'en',
}

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
        { type: 'adult', index: 0, diet: 'gluten_free', allergies: ['none'] },
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
]

describe.skipIf(!hasRealApiKey)(
  'AI Suggestions Stream E2E — Real AI Model',
  () => {
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
          lastName: 'Test',
          contactPhone: `+97250000100${i + 1}`,
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

    it('streams valid SSE events with correct item structure per category', async () => {
      const startMs = Date.now()

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/ai-suggestions/stream`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })

      const totalDurationMs = Date.now() - startMs

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/event-stream')

      const events = parseSseEvents(response.body)
      const suggestionEvents = events.filter((e) => e.event === 'suggestions')
      const doneEvents = events.filter((e) => e.event === 'done')
      const errorEvents = events.filter((e) => e.event === 'error')

      expect(suggestionEvents.length).toBeGreaterThanOrEqual(1)
      expect(doneEvents).toHaveLength(1)

      const allItems: Array<Record<string, unknown>> = []
      let totalInputTokens = 0
      let totalOutputTokens = 0

      for (const ev of suggestionEvents) {
        const category = ev.data.category as string
        expect(['group_equipment', 'personal_equipment', 'food']).toContain(
          category
        )

        const suggestions = ev.data.suggestions as Array<
          Record<string, unknown>
        >
        for (const item of suggestions) {
          expect(item.category).toBe(category)
          expect(ITEM_CATEGORY_VALUES as readonly string[]).toContain(
            item.category as string
          )
          expect(UNIT_VALUES as readonly string[]).toContain(
            item.unit as string
          )
          expect(typeof item.name).toBe('string')
          expect((item.name as string).trim().length).toBeGreaterThan(0)
          expect(typeof item.subcategory).toBe('string')
          expect((item.subcategory as string).trim().length).toBeGreaterThan(0)
          expect(typeof item.quantity).toBe('number')
          expect(item.quantity as number).toBeGreaterThan(0)
          expect(typeof item.reason).toBe('string')
          expect((item.reason as string).trim().length).toBeGreaterThan(0)
        }
        allItems.push(...suggestions)
      }

      expect(allItems.length).toBeGreaterThanOrEqual(5)

      const done = doneEvents[0].data
      expect(done.totalSuggestions).toBe(allItems.length)

      const aiLogIds = done.aiUsageLogIds as string[]
      for (const logId of aiLogIds) {
        const [usageLog] = await db
          .select()
          .from(aiUsageLogs)
          .where(eq(aiUsageLogs.id, logId))

        expect(usageLog).toBeDefined()
        expect(usageLog.planId).toBe(planId)
        expect(usageLog.featureType).toBe('item_suggestions')
        expect(usageLog.promptText).toBeTruthy()

        const meta = usageLog.metadata as Record<string, unknown>
        expect(meta.streamMode).toBe(true)
        expect(meta.streamRequestId).toBeTruthy()
        expect(['group_equipment', 'personal_equipment', 'food']).toContain(
          meta.targetCategory
        )

        totalInputTokens += Number(usageLog.inputTokens ?? 0)
        totalOutputTokens += Number(usageLog.outputTokens ?? 0)
      }

      const storedSuggestions = await db
        .select()
        .from(aiSuggestions)
        .where(eq(aiSuggestions.planId, planId))

      expect(storedSuggestions.length).toBe(allItems.length)

      scenarioResults.push({
        scenario: 'stream — all categories',
        mode: 'stream',
        categories: suggestionEvents.map((e) => e.data.category as string),
        totalItems: allItems.length,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: totalDurationMs,
      })

      if (errorEvents.length > 0) {
        console.warn(
          'Stream had error events:',
          errorEvents.map((e) => e.data)
        )
      }
    }, 120000)

    it('compares token usage: stream vs non-stream (logged, not asserted)', async () => {
      const streamStartMs = Date.now()

      const streamResponse = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/ai-suggestions/stream`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })

      const streamDurationMs = Date.now() - streamStartMs

      const singleStartMs = Date.now()

      const singleResponse = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/ai-suggestions`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })

      const singleDurationMs = Date.now() - singleStartMs

      if (singleResponse.statusCode === 200) {
        const singleBody = singleResponse.json()
        const [singleUsageLog] = await db
          .select()
          .from(aiUsageLogs)
          .where(eq(aiUsageLogs.id, singleBody.aiUsageLogId))

        scenarioResults.push({
          scenario: 'single — all categories',
          mode: 'single',
          categories: ['all'],
          totalItems: singleBody.suggestions.length,
          inputTokens: Number(singleUsageLog?.inputTokens ?? 0),
          outputTokens: Number(singleUsageLog?.outputTokens ?? 0),
          durationMs: singleDurationMs,
        })
      }

      if (streamResponse.statusCode === 200) {
        const streamEvents = parseSseEvents(streamResponse.body)
        const streamDone = streamEvents.find((e) => e.event === 'done')
        const streamLogIds = (streamDone?.data.aiUsageLogIds ?? []) as string[]

        let streamInputTokens = 0
        let streamOutputTokens = 0
        for (const logId of streamLogIds) {
          const [log] = await db
            .select()
            .from(aiUsageLogs)
            .where(eq(aiUsageLogs.id, logId))
          streamInputTokens += Number(log?.inputTokens ?? 0)
          streamOutputTokens += Number(log?.outputTokens ?? 0)
        }

        scenarioResults.push({
          scenario: 'stream — comparison run',
          mode: 'stream',
          categories: streamEvents
            .filter((e) => e.event === 'suggestions')
            .map((e) => e.data.category as string),
          totalItems: (streamDone?.data.totalSuggestions ?? 0) as number,
          inputTokens: streamInputTokens,
          outputTokens: streamOutputTokens,
          durationMs: streamDurationMs,
        })
      }

      console.log('\n=== Token Usage Comparison ===')
      for (const r of scenarioResults) {
        console.log(
          `  ${r.mode} (${r.scenario}): ${r.totalItems} items, ` +
            `input=${r.inputTokens} output=${r.outputTokens}, ` +
            `${r.durationMs}ms`
        )
      }
      console.log('===\n')
    }, 120000)
  }
)
