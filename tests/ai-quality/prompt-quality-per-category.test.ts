/**
 * Per-category prompt quality — real AI model.
 *
 * Isolated in tests/ai-quality/ — never runs during `npm run test`.
 * Run manually:  npm run test:ai-prompt-quality-per-category
 *
 * Requires .env with AI_PROVIDER and the matching API key.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { generateItemSuggestions } from '../../src/services/ai/item-suggestions/generate.js'
import { resolveLanguageModel } from '../../src/services/ai/model-provider.js'
import type { PlanForAiContext } from '../../src/services/ai/plan-context-formatters.js'
import type { ItemSuggestion } from '../../src/services/ai/item-suggestions/output-schema.js'
import type { SupportedAiLang } from '../../src/services/ai/item-suggestions/prompt-templates.js'

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

loadEnvFile()

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
  'grill',
  'charcoal',
  'spatula',
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

function hasScriptContamination(text: string): boolean {
  if (/[A-Za-z]/.test(text)) return true
  if (/[\u0600-\u06FF]/.test(text)) return true
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)) return true
  return false
}

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

const CAMPING_PLAN: PlanForAiContext = {
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
}

const BEACH_DAY_PLAN: PlanForAiContext = {
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
}

const HOTEL_PLAN: PlanForAiContext = {
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
}

const VEGAN_PARTY_PLAN: PlanForAiContext = {
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
}

type CachedResult = {
  suggestions: ItemSuggestion[]
  usage: Record<string, number | undefined>
}

const resultCache = new Map<string, CachedResult>()

async function runPerCategory(
  key: string,
  plan: PlanForAiContext,
  category: 'personal_equipment' | 'group_equipment' | 'food',
  lang: SupportedAiLang = 'en'
): Promise<CachedResult> {
  const ck = `${key}:${category}:${lang}`
  const cached = resultCache.get(ck)
  if (cached) return cached

  const model = resolveModel(lang)
  const planWithCategory: PlanForAiContext = {
    ...plan,
    categories: { [category]: [] },
  }
  const result = await generateItemSuggestions(model, planWithCategory, lang)
  logResult(`${key} [${category}] [${lang}]`, result.suggestions, result.usage)
  const entry = { suggestions: result.suggestions, usage: result.usage }
  resultCache.set(ck, entry)
  return entry
}

async function runAllCategories(
  key: string,
  plan: PlanForAiContext,
  lang: SupportedAiLang = 'en'
): Promise<CachedResult> {
  const ck = `${key}:all:${lang}`
  const cached = resultCache.get(ck)
  if (cached) return cached

  const model = resolveModel(lang)
  const result = await generateItemSuggestions(model, plan, lang)
  logResult(`${key} [all] [${lang}]`, result.suggestions, result.usage)
  const entry = { suggestions: result.suggestions, usage: result.usage }
  resultCache.set(ck, entry)
  return entry
}

describe('Per-category prompt quality (real API)', () => {
  describe('Camping — personal_equipment only', () => {
    it('includes sleeping bag or headlamp', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'personal_equipment'
      )
      const filtered = suggestions.filter(
        (s) => s.category === 'personal_equipment'
      )
      expect(filtered.length).toBeGreaterThanOrEqual(3)
      expect(filtered.length).toBeLessThanOrEqual(20)
      const sleepItems = anyNameMatches(suggestions, [
        'sleeping bag',
        'headlamp',
        'flashlight',
        'pillow',
      ])
      expect(sleepItems.length).toBeGreaterThanOrEqual(1)
    }, 60_000)

    it('all items have quantity = 1', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'personal_equipment'
      )
      for (const s of suggestions) {
        expect(s.quantity).toBe(1)
      }
    }, 60_000)

    it('all items are personal_equipment (no category bleed)', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'personal_equipment'
      )
      for (const s of suggestions) {
        expect(s.category).toBe('personal_equipment')
      }
    }, 60_000)
  })

  describe('Camping — group_equipment only', () => {
    it('includes tent or cooking gear', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'group_equipment'
      )
      const filtered = suggestions.filter(
        (s) => s.category === 'group_equipment'
      )
      expect(filtered.length).toBeGreaterThanOrEqual(3)
      expect(filtered.length).toBeLessThanOrEqual(20)
      const gear = anyNameMatches(suggestions, [
        ...SLEEPING_GEAR,
        ...COOKING_GEAR,
      ])
      expect(gear.length).toBeGreaterThanOrEqual(1)
    }, 60_000)

    it('all items are group_equipment (no category bleed)', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'group_equipment'
      )
      for (const s of suggestions) {
        expect(s.category).toBe('group_equipment')
      }
    }, 60_000)
  })

  describe('Camping — food only', () => {
    it('returns reasonable food items scaled to group', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'food'
      )
      const filtered = suggestions.filter((s) => s.category === 'food')
      expect(filtered.length).toBeGreaterThanOrEqual(3)
      expect(filtered.length).toBeLessThanOrEqual(20)
    }, 60_000)

    it('all items are food (no category bleed)', async () => {
      const { suggestions } = await runPerCategory(
        'camping',
        CAMPING_PLAN,
        'food'
      )
      for (const s of suggestions) {
        expect(s.category).toBe('food')
      }
    }, 60_000)
  })

  describe('Beach day — personal_equipment only', () => {
    it('includes sun protection', async () => {
      const { suggestions } = await runPerCategory(
        'beach',
        BEACH_DAY_PLAN,
        'personal_equipment'
      )
      const filtered = suggestions.filter(
        (s) => s.category === 'personal_equipment'
      )
      expect(filtered.length).toBeLessThanOrEqual(20)
      const sunItems = anyFieldMatches(filtered, SUN_PROTECTION)
      expect(sunItems.length).toBeGreaterThanOrEqual(1)
    }, 60_000)

    it('does NOT include sleeping gear', async () => {
      const { suggestions } = await runPerCategory(
        'beach',
        BEACH_DAY_PLAN,
        'personal_equipment'
      )
      const sleeping = anyNameMatches(suggestions, SLEEPING_GEAR)
      expect(sleeping).toEqual([])
    }, 60_000)
  })

  describe('Hotel trip — group_equipment only', () => {
    it('does NOT include tent or cooking gear', async () => {
      const { suggestions } = await runPerCategory(
        'hotel',
        HOTEL_PLAN,
        'group_equipment'
      )
      const tents = anyNameMatches(suggestions, ['tent'])
      expect(tents).toEqual([])
      const cooking = anyNameMatches(suggestions, COOKING_GEAR)
      expect(cooking).toEqual([])
    }, 60_000)
  })

  describe('Vegan party — food only', () => {
    it('includes vegan food items', async () => {
      const { suggestions } = await runPerCategory(
        'vegan-party',
        VEGAN_PARTY_PLAN,
        'food'
      )
      const filtered = suggestions.filter((s) => s.category === 'food')
      expect(filtered.length).toBeLessThanOrEqual(20)
      const veganish = anyFieldMatches(filtered, VEGAN_KEYWORDS)
      expect(veganish.length).toBeGreaterThanOrEqual(2)
    }, 60_000)

    it('does not label meat/fish as vegan', async () => {
      const { suggestions } = await runPerCategory(
        'vegan-party',
        VEGAN_PARTY_PLAN,
        'food'
      )
      const veganLabeled = suggestions.filter((s) => {
        const t = `${s.name} ${s.subcategory} ${s.reason}`.toLowerCase()
        return t.includes('vegan')
      })
      for (const s of veganLabeled) {
        const lower = s.name.toLowerCase()
        for (const kw of MEAT_FISH_KEYWORDS) {
          expect(lower.includes(kw)).toBe(false)
        }
      }
    }, 60_000)
  })

  describe('Combined coverage', () => {
    it('per-category results combined produce >= 15 total items', async () => {
      const [personal, group, food] = await Promise.all([
        runPerCategory('camping', CAMPING_PLAN, 'personal_equipment'),
        runPerCategory('camping', CAMPING_PLAN, 'group_equipment'),
        runPerCategory('camping', CAMPING_PLAN, 'food'),
      ])

      const total =
        personal.suggestions.length +
        group.suggestions.length +
        food.suggestions.length

      console.log(
        `Combined per-category: personal=${personal.suggestions.length}, ` +
          `group=${group.suggestions.length}, food=${food.suggestions.length}, ` +
          `total=${total}`
      )
      expect(total).toBeGreaterThanOrEqual(15)
    }, 120_000)
  })

  describe('Hebrew per-category — food only', () => {
    it('produces Hebrew names/subcategories without script contamination', async () => {
      const { suggestions } = await runPerCategory(
        'camping-he',
        CAMPING_PLAN,
        'food',
        'he'
      )
      const filtered = suggestions.filter((s) => s.category === 'food')
      expect(filtered.length).toBeGreaterThanOrEqual(3)
      expect(filtered.length).toBeLessThanOrEqual(20)

      for (const s of filtered) {
        expect(hasScriptContamination(s.name)).toBe(false)
        expect(hasScriptContamination(s.subcategory)).toBe(false)
      }
    }, 90_000)
  })

  describe('Token comparison — per-category vs single call', () => {
    it('logs token usage comparison (not asserted)', async () => {
      const [personal, group, food, all] = await Promise.all([
        runPerCategory('camping', CAMPING_PLAN, 'personal_equipment'),
        runPerCategory('camping', CAMPING_PLAN, 'group_equipment'),
        runPerCategory('camping', CAMPING_PLAN, 'food'),
        runAllCategories('camping', CAMPING_PLAN),
      ])

      const perCatInput =
        (personal.usage.inputTokens ?? 0) +
        (group.usage.inputTokens ?? 0) +
        (food.usage.inputTokens ?? 0)
      const perCatOutput =
        (personal.usage.outputTokens ?? 0) +
        (group.usage.outputTokens ?? 0) +
        (food.usage.outputTokens ?? 0)

      console.log('\n=== Token Usage Comparison (camping) ===')
      console.log(
        `  Single call: input=${all.usage.inputTokens}, output=${all.usage.outputTokens}, total=${all.usage.totalTokens}, items=${all.suggestions.length}`
      )
      console.log(
        `  Per-category: input=${perCatInput}, output=${perCatOutput}, total=${perCatInput + perCatOutput}, items=${personal.suggestions.length + group.suggestions.length + food.suggestions.length}`
      )
      console.log(
        `  Input ratio: ${(perCatInput / (all.usage.inputTokens ?? 1)).toFixed(2)}x`
      )
      console.log(
        `  Output ratio: ${(perCatOutput / (all.usage.outputTokens ?? 1)).toFixed(2)}x`
      )
      console.log('===\n')
    }, 120_000)
  })
})
