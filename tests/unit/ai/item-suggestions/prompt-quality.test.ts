/**
 * Prompt quality validation tests — SKIPPED by default.
 *
 * These tests call the REAL AI API to validate that the prompt produces
 * sensible, context-aware item suggestions. Run them manually:
 *
 *   AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/unit/ai/item-suggestions/prompt-quality.test.ts
 *
 * Remove `.skip` from the describe block to enable.
 *
 * NOTE: Schema compliance (valid category, unit, non-empty fields) is NOT
 * tested here — it is already enforced by Zod in generateObject. These tests
 * focus on whether the AI *understood the context* and produced relevant items.
 */
import { describe, it, expect } from 'vitest'
import { generateItemSuggestions } from '../../../../src/services/ai/item-suggestions/generate.js'
import { resolveLanguageModel } from '../../../../src/services/ai/model-provider.js'
import {
  EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
} from '../../../../src/services/ai/subcategories.js'
import type { PlanForAiContext } from '../../../../src/services/ai/plan-context-formatters.js'
import type { ItemSuggestion } from '../../../../src/services/ai/item-suggestions/output-schema.js'

const KNOWN_SUBCATEGORIES = [
  ...EQUIPMENT_SUBCATEGORIES,
  ...FOOD_SUBCATEGORIES,
] as readonly string[]

// ---------------------------------------------------------------------------
// Keyword matchers — fuzzy item detection by name
// ---------------------------------------------------------------------------

const SLEEPING_GEAR = [
  'sleeping bag',
  'tent',
  'sleeping pad',
  'sleeping mat',
  'mattress',
]
const COOKING_GEAR = [
  'stove',
  'cooking pot',
  'frying pan',
  'skillet',
  'grill',
  'charcoal',
  'spatula',
  'cutting board',
  'camp kitchen',
]
const SUN_PROTECTION = [
  'sunscreen',
  'sunblock',
  'sun hat',
  'sunglasses',
  'umbrella',
  'beach towel',
]
const WARM_CLOTHING = [
  'thermal',
  'fleece',
  'warm layer',
  'down jacket',
  'wool',
  'beanie',
  'gloves',
  'thermos',
  'hand warmer',
]
const KID_ITEMS = ['child', 'kid', 'baby', 'toddler', 'children']
const CLIMATE_SPECIFIC = [
  'snow',
  'ice',
  'ski',
  'beach',
  'sand',
  'tropical',
  'desert',
  'mountain boot',
  'crampon',
]

function anyNameMatches(
  items: ItemSuggestion[],
  keywords: string[]
): ItemSuggestion[] {
  return items.filter((item) => {
    const lower = item.name.toLowerCase()
    return keywords.some((kw) => lower.includes(kw))
  })
}

function anyFieldMatches(
  items: ItemSuggestion[],
  keywords: string[]
): ItemSuggestion[] {
  return items.filter((item) => {
    const text = `${item.name} ${item.reason} ${item.subcategory}`.toLowerCase()
    return keywords.some((kw) => text.includes(kw))
  })
}

// ---------------------------------------------------------------------------
// Logging helper — prints full output for manual prompt iteration
// ---------------------------------------------------------------------------

function logResult(
  scenario: string,
  suggestions: ItemSuggestion[],
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
) {
  console.log(`\n=== ${scenario} ===`)
  console.log(`Items: ${suggestions.length}`)
  console.log(
    `Tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}, total: ${usage.totalTokens}`
  )
  console.log('---')
  for (const s of suggestions) {
    console.log(
      `  [${s.category}] ${s.name} (qty: ${s.quantity} ${s.unit}) — ${s.subcategory} — ${s.reason}`
    )
  }
  console.log('===\n')
}

function resolveModel() {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'
  return resolveLanguageModel(provider)
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const SCENARIOS = {
  camping: {
    label: 'Camping trip — 3 nights, forest, family with kids',
    plan: {
      title: 'Family camping weekend',
      startDate: new Date('2026-07-10T10:00:00Z'),
      endDate: new Date('2026-07-13T10:00:00Z'),
      location: {
        locationId: 'loc-1',
        name: 'Black Forest',
        country: 'Germany',
        region: 'Baden-Württemberg',
      },
      tags: ['camping', 'hiking', 'cooking'],
      estimatedAdults: 2,
      estimatedKids: 2,
    } satisfies PlanForAiContext,
  },

  beach: {
    label: 'Day trip — beach, adults only',
    plan: {
      title: 'Beach day at the coast',
      startDate: new Date('2026-08-05T08:00:00Z'),
      endDate: new Date('2026-08-05T20:00:00Z'),
      location: {
        locationId: 'loc-2',
        name: 'Naxos Beach',
        country: 'Greece',
        region: 'Cyclades',
      },
      tags: ['beach', 'swimming'],
      estimatedAdults: 4,
      estimatedKids: 0,
    } satisfies PlanForAiContext,
  },

  hotel: {
    label: 'Hotel trip — city break',
    plan: {
      title: 'Berlin weekend getaway',
      startDate: new Date('2026-09-12T14:00:00Z'),
      endDate: new Date('2026-09-14T12:00:00Z'),
      location: {
        locationId: 'loc-3',
        name: 'Berlin',
        country: 'Germany',
      },
      tags: ['hotel', 'sightseeing'],
      estimatedAdults: 2,
      estimatedKids: 0,
    } satisfies PlanForAiContext,
  },

  minimal: {
    label: 'Minimal context — title only',
    plan: {
      title: 'Quick getaway',
      startDate: null,
      endDate: null,
      location: null,
      tags: [],
      estimatedAdults: null,
      estimatedKids: null,
    } satisfies PlanForAiContext,
  },

  winter: {
    label: 'Winter camping — cold weather',
    plan: {
      title: 'Winter mountain camping',
      startDate: new Date('2026-12-20T10:00:00Z'),
      endDate: new Date('2026-12-23T10:00:00Z'),
      location: {
        locationId: 'loc-4',
        name: 'Swiss Alps',
        country: 'Switzerland',
        region: 'Valais',
      },
      tags: ['camping', 'hiking', 'snow'],
      estimatedAdults: 3,
      estimatedKids: 0,
    } satisfies PlanForAiContext,
  },
} as const

// Quantity-scaling comparison scenarios
const SMALL_GROUP: PlanForAiContext = {
  title: 'Small group camping',
  startDate: new Date('2026-08-01T10:00:00Z'),
  endDate: new Date('2026-08-03T10:00:00Z'),
  location: {
    locationId: 'loc-5',
    name: 'Yosemite',
    country: 'USA',
    region: 'California',
  },
  tags: ['camping', 'cooking'],
  estimatedAdults: 2,
  estimatedKids: 0,
}

const LARGE_GROUP: PlanForAiContext = {
  ...SMALL_GROUP,
  title: 'Large group camping',
  estimatedAdults: 8,
  estimatedKids: 0,
}

// ---------------------------------------------------------------------------
// Helper to run a scenario once and cache the result
// ---------------------------------------------------------------------------

type ScenarioResult = {
  suggestions: ItemSuggestion[]
  usage: Record<string, number | undefined>
}
const resultCache = new Map<string, ScenarioResult>()

async function runScenario(
  model: ReturnType<typeof resolveModel>,
  key: string,
  plan: PlanForAiContext
): Promise<ScenarioResult> {
  const cached = resultCache.get(key)
  if (cached) return cached

  const result = await generateItemSuggestions(model, plan)
  logResult(key, result.suggestions, result.usage)
  const entry = { suggestions: result.suggestions, usage: result.usage }
  resultCache.set(key, entry)
  return entry
}

// ===========================================================================
// Tests
// ===========================================================================

describe.skip('Prompt quality — heuristic assertions (real API)', () => {
  const model = resolveModel()

  // -------------------------------------------------------------------------
  // Shared assertions for every scenario
  // -------------------------------------------------------------------------
  for (const [key, { label, plan }] of Object.entries(SCENARIOS)) {
    describe(label, () => {
      it('generates 15-50 items across all three categories', async () => {
        const { suggestions } = await runScenario(model, key, plan)
        expect(suggestions.length).toBeGreaterThanOrEqual(15)
        expect(suggestions.length).toBeLessThanOrEqual(50)

        const categories = new Set(suggestions.map((s) => s.category))
        expect(categories.has('group_equipment')).toBe(true)
        expect(categories.has('personal_equipment')).toBe(true)
        expect(categories.has('food')).toBe(true)
      }, 30_000)

      it('personal_equipment items have quantity = 1', async () => {
        const { suggestions } = await runScenario(model, key, plan)
        const personal = suggestions.filter(
          (s) => s.category === 'personal_equipment'
        )
        for (const s of personal) {
          expect(s.quantity).toBe(1)
        }
      })

      it('most subcategories come from the known vocabulary (>=70%)', async () => {
        const { suggestions } = await runScenario(model, key, plan)
        const knownCount = suggestions.filter((s) =>
          KNOWN_SUBCATEGORIES.includes(s.subcategory)
        ).length
        const ratio = knownCount / suggestions.length
        expect(ratio).toBeGreaterThanOrEqual(0.7)
      })
    })
  }

  // -------------------------------------------------------------------------
  // Context-specific heuristic checks
  // -------------------------------------------------------------------------
  describe('Context sensitivity', () => {
    it('camping trip includes sleeping gear and cooking gear', async () => {
      const { suggestions } = await runScenario(
        model,
        'camping',
        SCENARIOS.camping.plan
      )

      const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
      expect(sleeping.length).toBeGreaterThanOrEqual(1)

      const cooking = anyNameMatches(suggestions, COOKING_GEAR)
      expect(cooking.length).toBeGreaterThanOrEqual(1)
    }, 30_000)

    it('camping trip with kids includes kid-relevant items', async () => {
      const { suggestions } = await runScenario(
        model,
        'camping',
        SCENARIOS.camping.plan
      )

      const kidRelated = anyFieldMatches(suggestions, KID_ITEMS)
      expect(kidRelated.length).toBeGreaterThanOrEqual(1)
    }, 30_000)

    it('beach day trip includes sun protection items', async () => {
      const { suggestions } = await runScenario(
        model,
        'beach',
        SCENARIOS.beach.plan
      )

      const sunItems = anyFieldMatches(suggestions, SUN_PROTECTION)
      expect(sunItems.length).toBeGreaterThanOrEqual(1)
    }, 30_000)

    it('beach day trip does NOT include sleeping gear', async () => {
      const { suggestions } = await runScenario(
        model,
        'beach',
        SCENARIOS.beach.plan
      )

      const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
      expect(sleeping).toEqual([])
    }, 30_000)

    it('hotel trip does NOT include sleeping gear, tent, or cooking gear', async () => {
      const { suggestions } = await runScenario(
        model,
        'hotel',
        SCENARIOS.hotel.plan
      )

      const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
      expect(sleeping).toEqual([])

      const cooking = anyNameMatches(suggestions, COOKING_GEAR)
      expect(cooking).toEqual([])
    }, 30_000)

    it('winter camping includes warm clothing / cold weather gear', async () => {
      const { suggestions } = await runScenario(
        model,
        'winter',
        SCENARIOS.winter.plan
      )

      const warmItems = anyFieldMatches(suggestions, WARM_CLOTHING)
      expect(warmItems.length).toBeGreaterThanOrEqual(1)
    }, 30_000)

    it('winter camping includes sleeping gear', async () => {
      const { suggestions } = await runScenario(
        model,
        'winter',
        SCENARIOS.winter.plan
      )

      const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
      expect(sleeping.length).toBeGreaterThanOrEqual(1)
    }, 30_000)
  })

  // -------------------------------------------------------------------------
  // Category assignment correctness
  // -------------------------------------------------------------------------
  describe('Category assignment', () => {
    it('tent is group_equipment, sleeping bag is personal_equipment', async () => {
      const { suggestions } = await runScenario(
        model,
        'camping',
        SCENARIOS.camping.plan
      )

      const tents = suggestions.filter((s) =>
        s.name.toLowerCase().includes('tent')
      )
      for (const t of tents) {
        expect(t.category).toBe('group_equipment')
      }

      const sleepingBags = suggestions.filter((s) =>
        s.name.toLowerCase().includes('sleeping bag')
      )
      for (const sb of sleepingBags) {
        expect(sb.category).toBe('personal_equipment')
      }
    }, 30_000)

    it('food/drink items are categorized as food', async () => {
      const { suggestions } = await runScenario(
        model,
        'camping',
        SCENARIOS.camping.plan
      )

      const foodKeywords = [
        'bread',
        'rice',
        'pasta',
        'snack',
        'juice',
        'coffee',
        'cheese',
        'egg',
      ]
      const foodItems = anyNameMatches(suggestions, foodKeywords)
      for (const f of foodItems) {
        expect(f.category).toBe('food')
      }
    }, 30_000)
  })

  // -------------------------------------------------------------------------
  // Quantity scaling — larger group should get more food
  // -------------------------------------------------------------------------
  describe('Quantity scaling', () => {
    it('larger group (8 people) gets higher total food quantity than small group (2 people)', async () => {
      const smallResult = await runScenario(model, 'small-group', SMALL_GROUP)
      const largeResult = await runScenario(model, 'large-group', LARGE_GROUP)

      const totalFoodQty = (items: ItemSuggestion[]) =>
        items
          .filter((s) => s.category === 'food')
          .reduce((sum, s) => sum + s.quantity, 0)

      const smallTotal = totalFoodQty(smallResult.suggestions)
      const largeTotal = totalFoodQty(largeResult.suggestions)

      console.log(
        `Food qty — small group (2): ${smallTotal}, large group (8): ${largeTotal}`
      )
      expect(largeTotal).toBeGreaterThan(smallTotal)
    }, 60_000)
  })

  // -------------------------------------------------------------------------
  // No context hallucination — minimal scenario
  // -------------------------------------------------------------------------
  describe('No context hallucination', () => {
    it('minimal context (title only) does NOT include climate-specific gear', async () => {
      const { suggestions } = await runScenario(
        model,
        'minimal',
        SCENARIOS.minimal.plan
      )

      const climateSpecific = anyNameMatches(suggestions, CLIMATE_SPECIFIC)

      if (climateSpecific.length > 0) {
        console.warn(
          'Possible hallucination — climate-specific items with no location/tags:',
          climateSpecific.map((s) => s.name)
        )
      }
      expect(climateSpecific.length).toBeLessThanOrEqual(3)
    }, 30_000)

    it('minimal context still produces a reasonable number of items', async () => {
      const { suggestions } = await runScenario(
        model,
        'minimal',
        SCENARIOS.minimal.plan
      )
      expect(suggestions.length).toBeGreaterThanOrEqual(10)
      expect(suggestions.length).toBeLessThanOrEqual(50)
    }, 30_000)
  })
})
