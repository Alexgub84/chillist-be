import { describe, it, expect } from 'vitest'
import { MockLanguageModelV2 } from 'ai/test'
import { generateItemSuggestions } from '../../../../src/services/ai/item-suggestions/generate.js'
import type { PlanForAiContext } from '../../../../src/services/ai/plan-context-formatters.js'

const basePlan: PlanForAiContext = {
  title: 'Summer camping',
  startDate: new Date('2026-07-01T12:00:00.000Z'),
  endDate: new Date('2026-07-04T12:00:00.000Z'),
  location: {
    locationId: 'loc-1',
    name: 'Lake Tahoe',
    country: 'USA',
    region: 'California',
    city: 'South Lake Tahoe',
  },
  tags: ['camping', 'hiking'],
  estimatedAdults: 2,
  estimatedKids: 1,
}

const fakeSuggestions = [
  {
    name: 'Tent',
    category: 'group_equipment',
    subcategory: 'Venue Setup and Layout',
    quantity: 1,
    unit: 'pcs',
    reason: 'Shelter for 3-night camping trip',
  },
  {
    name: 'Sleeping bag',
    category: 'personal_equipment',
    subcategory: 'Comfort and Climate Control',
    quantity: 1,
    unit: 'pcs',
    reason: 'Each person needs warmth for overnight camping',
  },
  {
    name: 'Bottled water',
    category: 'food',
    subcategory: 'Beverages (non-alcoholic)',
    quantity: 6,
    unit: 'l',
    reason: 'Hydration for 3 people over 3 nights',
  },
]

function createMockModel(
  elements: unknown[],
  usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
) {
  return new MockLanguageModelV2({
    doGenerate: {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ elements }),
        },
      ],
      finishReason: 'stop' as const,
      usage,
      warnings: [],
    },
  })
}

describe('generateItemSuggestions', () => {
  it('returns parsed suggestions and usage from the model', async () => {
    const model = createMockModel(fakeSuggestions)
    const result = await generateItemSuggestions(model, basePlan)

    expect(result.suggestions).toHaveLength(3)
    expect(result.suggestions[0].name).toBe('Tent')
    expect(result.suggestions[0].category).toBe('group_equipment')
    expect(result.suggestions[1].name).toBe('Sleeping bag')
    expect(result.suggestions[1].category).toBe('personal_equipment')
    expect(result.suggestions[2].name).toBe('Bottled water')
    expect(result.suggestions[2].category).toBe('food')
  })

  it('returns the prompt string that was sent', async () => {
    const model = createMockModel(fakeSuggestions)
    const result = await generateItemSuggestions(model, basePlan)

    expect(result.prompt).toContain('Summer camping')
    expect(result.prompt).toContain('3 nights')
    expect(result.prompt).toContain('Lake Tahoe')
  })

  it('includes Hebrew language instruction when lang is he', async () => {
    const model = createMockModel(fakeSuggestions)
    const result = await generateItemSuggestions(model, basePlan, 'he')

    expect(result.prompt).toContain('עברית')
  })

  it('returns token usage from the model response', async () => {
    const model = createMockModel(fakeSuggestions, {
      inputTokens: 200,
      outputTokens: 300,
      totalTokens: 500,
    })
    const result = await generateItemSuggestions(model, basePlan)

    expect(result.usage).toEqual({
      inputTokens: 200,
      outputTokens: 300,
      totalTokens: 500,
    })
  })

  it('returns empty array when model returns empty array', async () => {
    const model = createMockModel([])
    const result = await generateItemSuggestions(model, basePlan)

    expect(result.suggestions).toEqual([])
  })

  it('throws when model returns invalid JSON', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: {
        content: [{ type: 'text' as const, text: 'not valid json at all' }],
        finishReason: 'stop' as const,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        warnings: [],
      },
    })

    await expect(generateItemSuggestions(model, basePlan)).rejects.toThrow()
  })

  it('accepts decimal quantities (e.g. 0.5 kg cheese)', async () => {
    const decimalItems = [
      { ...fakeSuggestions[2], name: 'Cheese', quantity: 0.5, unit: 'kg' },
      { ...fakeSuggestions[2], name: 'Cooking oil', quantity: 1.5, unit: 'l' },
    ]
    const model = createMockModel(decimalItems)
    const result = await generateItemSuggestions(model, basePlan)

    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions[0].quantity).toBe(0.5)
    expect(result.suggestions[1].quantity).toBe(1.5)
  })

  it('throws when model returns items with invalid category', async () => {
    const badItems = [{ ...fakeSuggestions[0], category: 'invalid_category' }]
    const model = createMockModel(badItems)

    await expect(generateItemSuggestions(model, basePlan)).rejects.toThrow()
  })

  it('throws when model throws an error', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: () => {
        throw new Error('API rate limit exceeded')
      },
    })

    await expect(generateItemSuggestions(model, basePlan)).rejects.toThrow(
      'API rate limit exceeded'
    )
  })
})
