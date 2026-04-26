/**
 * AI suggestions per-category REST — real AI model E2E.
 *
 * Fires 3 parallel POSTs (food, group_equipment, personal_equipment) at a
 * real `app.listen` port with a shared X-Generation-Id header, validates
 * each response shape and records per-call timings + tokens to
 * `logs/ai-suggestions-e2e-<ts>.json`.
 *
 * Gated by RUN_AI_E2E=true so it never runs during normal `npm run test`.
 * Run manually:
 *   RUN_AI_E2E=true npm run test:ai-suggestions-e2e
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
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
    // .env file not found — ok when running in CI
  }
}

loadEnvFile()

const shouldRun = process.env.RUN_AI_E2E === 'true'
const describeIf = shouldRun ? describe : describe.skip

const OWNER_USER_ID = 'aaaaaaaa-3333-4444-5555-6666aaaaaaaa'
const CATEGORIES: ItemCategory[] = [
  'food',
  'group_equipment',
  'personal_equipment',
]

interface CallResult {
  category: ItemCategory
  statusCode: number
  durationMs: number
  startedAtMs: number
  completedAtMs: number
  suggestionCount: number
  suggestions: Array<{
    id: string
    name: string
    category: string
    subcategory: string
    quantity: number
    unit: string
    reason: string
  }>
  aiUsageLogId: string
  generationId: string
}

async function seedPlan(): Promise<string> {
  const db = await getTestDb()
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'E2E Weekend Camping Trip',
      status: 'active',
      visibility: 'invite_only',
      createdByUserId: OWNER_USER_ID,
      startDate: new Date('2026-09-04'),
      endDate: new Date('2026-09-06'),
      estimatedAdults: 4,
      estimatedKids: 2,
      tags: ['camping', 'nature', 'family'],
      location: {
        locationId: 'loc-e2e',
        name: 'Ein Gedi',
        city: 'Ein Gedi',
        country: 'Israel',
      },
      defaultLang: 'en',
    })
    .returning({ planId: plans.planId })

  await db.insert(participants).values({
    planId: plan.planId,
    name: 'E2E Owner',
    lastName: 'Tester',
    contactPhone: '+15550009999',
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

function writeReport(filename: string, data: unknown) {
  try {
    mkdirSync(resolve(process.cwd(), 'logs'), { recursive: true })
  } catch {
    // ignore
  }
  writeFileSync(
    resolve(process.cwd(), 'logs', filename),
    JSON.stringify(data, null, 2),
    'utf-8'
  )
}

describeIf('AI Suggestions per-category REST — real AI model (E2E)', () => {
  let app: FastifyInstance
  let token: string
  let address: string

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
    address = await app.listen({ port: 0, host: '127.0.0.1' })
  }, 120_000)

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  it('fires 3 parallel real HTTP calls with a shared X-Generation-Id and records timings', async () => {
    const planId = await seedPlan()
    const generationId = randomUUID()
    const runStartMs = Date.now()

    try {
      const callOne = async (category: ItemCategory): Promise<CallResult> => {
        const startedAtMs = Date.now() - runStartMs
        const t0 = Date.now()
        const response = await fetch(
          `${address}/plans/${planId}/ai-suggestions/${category}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token}`,
              'x-generation-id': generationId,
            },
            body: JSON.stringify({}),
          }
        )
        const durationMs = Date.now() - t0
        const completedAtMs = Date.now() - runStartMs
        const body = (await response.json()) as {
          suggestions: CallResult['suggestions']
          aiUsageLogId: string
          generationId: string
        }

        return {
          category,
          statusCode: response.status,
          durationMs,
          startedAtMs,
          completedAtMs,
          suggestionCount: body.suggestions?.length ?? 0,
          suggestions: body.suggestions ?? [],
          aiUsageLogId: body.aiUsageLogId,
          generationId: body.generationId,
        }
      }

      const results = await Promise.all(CATEGORIES.map(callOne))

      for (const r of results) {
        expect(r.statusCode).toBe(200)
        expect(r.generationId).toBe(generationId)
        expect(r.suggestionCount).toBeGreaterThan(0)
        expect(r.suggestionCount).toBeLessThanOrEqual(20)
        for (const item of r.suggestions) {
          expect(item.category).toBe(r.category)
          expect(typeof item.name).toBe('string')
          expect(item.name.length).toBeGreaterThan(0)
          expect(typeof item.subcategory).toBe('string')
          expect(typeof item.reason).toBe('string')
          expect(item.quantity).toBeGreaterThan(0)
          expect([
            'pcs',
            'kg',
            'g',
            'lb',
            'oz',
            'l',
            'ml',
            'm',
            'cm',
            'pack',
            'set',
          ]).toContain(item.unit)
        }
      }

      const db = await getTestDb()
      const usageRows = await db
        .select()
        .from(aiUsageLogs)
        .where(eq(aiUsageLogs.planId, planId))
      expect(usageRows).toHaveLength(3)
      for (const row of usageRows) {
        const meta = row.metadata as Record<string, unknown>
        expect(meta.generationId).toBe(generationId)
      }

      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '-')
        .slice(0, 19)
      const reportName = `ai-suggestions-e2e-${ts}.json`
      const totalDurationMs = Date.now() - runStartMs
      const report = {
        runAt: new Date().toISOString(),
        planId,
        generationId,
        totalDurationMs,
        totalSuggestions: results.reduce((s, r) => s + r.suggestionCount, 0),
        perCategory: results.map((r) => ({
          category: r.category,
          statusCode: r.statusCode,
          durationMs: r.durationMs,
          startedAtMs: r.startedAtMs,
          completedAtMs: r.completedAtMs,
          suggestionCount: r.suggestionCount,
          aiUsageLogId: r.aiUsageLogId,
        })),
        usage: usageRows.map((u) => ({
          aiUsageLogId: u.id,
          modelId: u.modelId,
          provider: u.provider,
          lang: u.lang,
          status: u.status,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          totalTokens: u.totalTokens,
          durationMs: u.durationMs,
          resultCount: u.resultCount,
          metadata: u.metadata,
        })),
        suggestionsByCategory: results.reduce<
          Record<string, CallResult['suggestions']>
        >((acc, r) => {
          acc[r.category] = r.suggestions
          return acc
        }, {}),
      }
      writeReport(reportName, report)

      console.log('\n=== AI Suggestions per-category E2E ===')
      console.log(`generationId: ${generationId}`)
      console.log(`total wall time: ${totalDurationMs}ms`)
      for (const r of results) {
        console.log(
          `  ${r.category.padEnd(20)}  ${r.durationMs}ms  ` +
            `(+${r.startedAtMs}ms → +${r.completedAtMs}ms)  ` +
            `${r.suggestionCount} items`
        )
      }
      console.log(`report written: logs/${reportName}\n`)
    } finally {
      await cleanupPlan(planId)
    }
  }, 120_000)

  it('accepts 31 subcategory hints without 400 (regression for FE vocabulary size)', async () => {
    const planId = await seedPlan()
    try {
      const subcategories = Array.from(
        { length: 31 },
        (_, i) => `Subcategory ${i}`
      )
      const response = await fetch(
        `${address}/plans/${planId}/ai-suggestions/food`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ subcategories }),
        }
      )
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        suggestions: Array<{ category: string }>
      }
      expect(body.suggestions.length).toBeGreaterThan(0)
      expect(body.suggestions.length).toBeLessThanOrEqual(20)
      for (const item of body.suggestions) {
        expect(item.category).toBe('food')
      }
    } finally {
      await cleanupPlan(planId)
    }
  }, 120_000)

  it('subcategories hint shapes the generation', async () => {
    const planId = await seedPlan()
    try {
      const response = await fetch(
        `${address}/plans/${planId}/ai-suggestions/food`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            subcategories: ['breakfast', 'snacks'],
          }),
        }
      )
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        suggestions: Array<{ category: string; name: string }>
      }
      for (const item of body.suggestions) {
        expect(item.category).toBe('food')
      }
      expect(body.suggestions.length).toBeGreaterThan(0)
    } finally {
      await cleanupPlan(planId)
    }
  }, 120_000)
})
