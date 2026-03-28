/**
 * Prompt quality validation tests — SKIPPED by default.
 *
 * These tests call the REAL AI API to validate that the prompt produces
 * sensible, context-aware item suggestions. Run them manually from repo root:
 *
 *   npm run test:ai-prompt-quality
 *
 * (Sets RUN_PROMPT_QUALITY=true and loads AI keys from .env — see
 * scripts/test-ai-prompt-quality.sh.) Or one-liner:
 *
 *   RUN_PROMPT_QUALITY=true AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npx vitest run tests/unit/ai/item-suggestions/prompt-quality.test.ts
 *
 * Without RUN_PROMPT_QUALITY=true the suite is skipped. If `source .env` fails,
 * the script exports only AI vars via grep (same pattern as above one-liner).
 *
 * NOTE: Schema compliance (valid category, unit, non-empty fields) is NOT
 * tested here — it is already enforced by Zod in generateObject. These tests
 * focus on whether the AI *understood the context* and produced relevant items.
 */
import { describe, it, expect } from 'vitest'
import { generateItemSuggestions } from '../../../../src/services/ai/item-suggestions/generate.js'
import { resolveLanguageModel } from '../../../../src/services/ai/model-provider.js'
import type { PlanForAiContext } from '../../../../src/services/ai/plan-context-formatters.js'
import type { ItemSuggestion } from '../../../../src/services/ai/item-suggestions/output-schema.js'
import type { SupportedAiLang } from '../../../../src/services/ai/item-suggestions/prompt-templates.js'

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

function resolveModel(lang: SupportedAiLang = 'en') {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'
  return resolveLanguageModel(provider, lang)
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

  vegan_party: {
    label: 'Dinner party — mixed vegan/vegetarian guests',
    plan: {
      title: 'Vegan dinner party',
      startDate: new Date('2026-09-01T18:00:00Z'),
      endDate: new Date('2026-09-01T23:00:00Z'),
      location: {
        locationId: 'loc-vp',
        name: 'Home',
        country: 'USA',
      },
      tags: ['dinner_party', 'dinner_home'],
      estimatedAdults: 4,
      estimatedKids: 0,
      dietarySummary: '2 vegan, 1 vegetarian, 1 no restrictions',
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

function cacheKey(key: string, lang: SupportedAiLang) {
  return `${key}:${lang}`
}

async function runScenario(
  key: string,
  plan: PlanForAiContext,
  lang: SupportedAiLang = 'en'
): Promise<ScenarioResult> {
  const ck = cacheKey(key, lang)
  const cached = resultCache.get(ck)
  if (cached) return cached

  const model = resolveModel(lang)
  const result = await generateItemSuggestions(model, plan, lang)
  logResult(`${key} [${lang}]`, result.suggestions, result.usage)
  const entry = { suggestions: result.suggestions, usage: result.usage }
  resultCache.set(ck, entry)
  return entry
}

function hasHebrewScript(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text)
}

function hasScriptContamination(text: string): boolean {
  if (/[A-Za-z]/.test(text)) return true
  if (/[\u0600-\u06FF]/.test(text)) return true
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)) return true
  return false
}

const VEGAN_KEYWORDS = [
  'vegan',
  'plant',
  'tofu',
  'tempeh',
  'legume',
  'hummus',
  'vegetable',
]
const MEAT_FISH_KEYWORDS = [
  'chicken',
  'beef',
  'pork',
  'salmon',
  'tuna',
  'steak',
  'fish',
  'meat',
  'turkey',
]

// ===========================================================================
// Tests
// ===========================================================================

const runPromptQuality = process.env.RUN_PROMPT_QUALITY === 'true'
const provider = process.env.AI_PROVIDER ?? 'anthropic'
const hasRealApiKey =
  provider === 'openai'
    ? Boolean(process.env.OPENAI_API_KEY?.trim())
    : Boolean(process.env.ANTHROPIC_API_KEY?.trim())

const describePromptQuality =
  runPromptQuality && hasRealApiKey ? describe : describe.skip

describePromptQuality(
  'Prompt quality — heuristic assertions (real API)',
  () => {
    // -------------------------------------------------------------------------
    // Shared assertions for every scenario
    // -------------------------------------------------------------------------
    for (const [key, { label, plan }] of Object.entries(SCENARIOS)) {
      describe(label, () => {
        it('generates 15-50 items across all three categories', async () => {
          const { suggestions } = await runScenario(key, plan)
          expect(suggestions.length).toBeGreaterThanOrEqual(15)
          expect(suggestions.length).toBeLessThanOrEqual(50)

          const categories = new Set(suggestions.map((s) => s.category))
          expect(categories.has('group_equipment')).toBe(true)
          expect(categories.has('personal_equipment')).toBe(true)
          expect(categories.has('food')).toBe(true)
        }, 30_000)

        it('personal_equipment items have quantity = 1', async () => {
          const { suggestions } = await runScenario(key, plan)
          const personal = suggestions.filter(
            (s) => s.category === 'personal_equipment'
          )
          for (const s of personal) {
            expect(s.quantity).toBe(1)
          }
        })

        it('every item has a non-empty subcategory (custom labels allowed)', async () => {
          const { suggestions } = await runScenario(key, plan)
          for (const s of suggestions) {
            expect(s.subcategory.trim().length).toBeGreaterThan(0)
          }
        })
      })
    }

    // -------------------------------------------------------------------------
    // Context-specific heuristic checks
    // -------------------------------------------------------------------------
    describe('Context sensitivity', () => {
      it('camping trip includes sleeping gear and cooking gear', async () => {
        const { suggestions } = await runScenario(
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
          'camping',
          SCENARIOS.camping.plan
        )

        const kidRelated = anyFieldMatches(suggestions, KID_ITEMS)
        expect(kidRelated.length).toBeGreaterThanOrEqual(1)
      }, 30_000)

      it('beach day trip includes sun protection items', async () => {
        const { suggestions } = await runScenario('beach', SCENARIOS.beach.plan)

        const sunItems = anyFieldMatches(suggestions, SUN_PROTECTION)
        expect(sunItems.length).toBeGreaterThanOrEqual(1)
      }, 30_000)

      it('beach day trip does NOT include sleeping gear', async () => {
        const { suggestions } = await runScenario('beach', SCENARIOS.beach.plan)

        const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
        expect(sleeping).toEqual([])
      }, 30_000)

      it('hotel trip does NOT include sleeping gear, tent, or cooking gear', async () => {
        const { suggestions } = await runScenario('hotel', SCENARIOS.hotel.plan)

        const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
        expect(sleeping).toEqual([])

        const cooking = anyNameMatches(suggestions, COOKING_GEAR)
        expect(cooking).toEqual([])
      }, 30_000)

      it('winter camping includes warm clothing / cold weather gear', async () => {
        const { suggestions } = await runScenario(
          'winter',
          SCENARIOS.winter.plan
        )

        const warmItems = anyFieldMatches(suggestions, WARM_CLOTHING)
        expect(warmItems.length).toBeGreaterThanOrEqual(1)
      }, 30_000)

      it('winter camping includes sleeping gear', async () => {
        const { suggestions } = await runScenario(
          'winter',
          SCENARIOS.winter.plan
        )

        const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
        expect(sleeping.length).toBeGreaterThanOrEqual(1)
      }, 30_000)
    })

    describe('Dietary context (vegan party)', () => {
      it('includes at least two vegan-related food items', async () => {
        const { suggestions } = await runScenario(
          'vegan_party',
          SCENARIOS.vegan_party.plan
        )
        const food = suggestions.filter((s) => s.category === 'food')
        const veganish = anyFieldMatches(food, VEGAN_KEYWORDS)
        expect(veganish.length).toBeGreaterThanOrEqual(2)
      }, 60_000)

      it('does not pair meat/fish product names with vegan labeling', async () => {
        const { suggestions } = await runScenario(
          'vegan_party',
          SCENARIOS.vegan_party.plan
        )
        const food = suggestions.filter((s) => s.category === 'food')
        const veganLabeled = food.filter((s) => {
          const t = `${s.name} ${s.subcategory} ${s.reason}`.toLowerCase()
          return t.includes('vegan')
        })
        expect(veganLabeled.length).toBeGreaterThanOrEqual(1)
        for (const s of veganLabeled) {
          const lower = s.name.toLowerCase()
          for (const kw of MEAT_FISH_KEYWORDS) {
            expect(lower.includes(kw)).toBe(false)
          }
        }
      }, 60_000)
    })

    // -------------------------------------------------------------------------
    // Category assignment correctness
    // -------------------------------------------------------------------------
    describe('Category assignment', () => {
      it('tent is group_equipment, sleeping bag is personal_equipment', async () => {
        const { suggestions } = await runScenario(
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
        const smallResult = await runScenario('small-group', SMALL_GROUP)
        const largeResult = await runScenario('large-group', LARGE_GROUP)

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
          'minimal',
          SCENARIOS.minimal.plan
        )
        expect(suggestions.length).toBeGreaterThanOrEqual(10)
        expect(suggestions.length).toBeLessThanOrEqual(50)
      }, 30_000)
    })

    describe('Hebrew output (camping) — names/reasons in Hebrew', () => {
      it('generates 15–50 items with Hebrew script in most item names or reasons', async () => {
        const { suggestions } = await runScenario(
          'camping-he',
          SCENARIOS.camping.plan,
          'he'
        )
        expect(suggestions.length).toBeGreaterThanOrEqual(15)
        expect(suggestions.length).toBeLessThanOrEqual(50)

        const withHebrew = suggestions.filter(
          (s) => hasHebrewScript(s.name) || hasHebrewScript(s.reason)
        )
        expect(withHebrew.length / suggestions.length).toBeGreaterThanOrEqual(
          0.6
        )
      }, 60_000)

      it('personal_equipment items have quantity = 1 (Hebrew)', async () => {
        const { suggestions } = await runScenario(
          'camping-he',
          SCENARIOS.camping.plan,
          'he'
        )
        const personal = suggestions.filter(
          (s) => s.category === 'personal_equipment'
        )
        for (const s of personal) {
          expect(s.quantity).toBe(1)
        }
      }, 60_000)

      it('covers all three categories (Hebrew)', async () => {
        const { suggestions } = await runScenario(
          'camping-he',
          SCENARIOS.camping.plan,
          'he'
        )
        const categories = new Set(suggestions.map((s) => s.category))
        expect(categories.has('group_equipment')).toBe(true)
        expect(categories.has('personal_equipment')).toBe(true)
        expect(categories.has('food')).toBe(true)
      }, 60_000)

      it('name and subcategory avoid Latin, Arabic, CJK, or Hangul (Hebrew)', async () => {
        const { suggestions } = await runScenario(
          'camping-he',
          SCENARIOS.camping.plan,
          'he'
        )
        for (const s of suggestions) {
          expect(hasScriptContamination(s.name)).toBe(false)
          expect(hasScriptContamination(s.subcategory)).toBe(false)
        }
      }, 60_000)

      it('uses a bounded number of distinct subcategories (3–10, Hebrew)', async () => {
        const { suggestions } = await runScenario(
          'camping-he',
          SCENARIOS.camping.plan,
          'he'
        )
        const subs = new Set(suggestions.map((s) => s.subcategory.trim()))
        expect(subs.size).toBeGreaterThanOrEqual(3)
        expect(subs.size).toBeLessThanOrEqual(10)
      }, 60_000)
    })

    describe('Hebrew output (vegan dinner party)', () => {
      it('mentions vegan or vegetarian in Hebrew on at least one food item', async () => {
        const { suggestions } = await runScenario(
          'vegan-party-he',
          SCENARIOS.vegan_party.plan,
          'he'
        )
        const food = suggestions.filter((s) => s.category === 'food')
        const hebrewDiet = food.filter((s) =>
          /טבעוני|צמחוני/.test(`${s.name} ${s.subcategory} ${s.reason}`)
        )
        expect(hebrewDiet.length).toBeGreaterThanOrEqual(1)
      }, 90_000)

      it('name and subcategory avoid mixed scripts (vegan party, Hebrew)', async () => {
        const { suggestions } = await runScenario(
          'vegan-party-he',
          SCENARIOS.vegan_party.plan,
          'he'
        )
        for (const s of suggestions) {
          expect(hasScriptContamination(s.name)).toBe(false)
          expect(hasScriptContamination(s.subcategory)).toBe(false)
        }
      }, 90_000)
    })
  }
)
