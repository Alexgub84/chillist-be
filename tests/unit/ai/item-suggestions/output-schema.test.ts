import { describe, it, expect } from 'vitest'
import { itemSuggestionSchema } from '../../../../src/services/ai/item-suggestions/output-schema.js'
import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../../../../src/db/schema.js'

describe('itemSuggestionSchema', () => {
  const validItem = {
    name: 'Sleeping bag',
    category: 'personal_equipment' as const,
    subcategory: 'Comfort and Climate Control',
    quantity: 2,
    unit: 'pcs' as const,
    reason: 'Essential for overnight camping trips',
  }

  it('parses a valid suggestion', () => {
    const result = itemSuggestionSchema.safeParse(validItem)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validItem)
    }
  })

  it('category enum values match ITEM_CATEGORY_VALUES from DB schema', () => {
    for (const cat of ITEM_CATEGORY_VALUES) {
      const result = itemSuggestionSchema.safeParse({
        ...validItem,
        category: cat,
      })
      expect(result.success).toBe(true)
    }
  })

  it('unit enum values match UNIT_VALUES from DB schema', () => {
    for (const unit of UNIT_VALUES) {
      const result = itemSuggestionSchema.safeParse({
        ...validItem,
        unit,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects an invalid category', () => {
    const result = itemSuggestionSchema.safeParse({
      ...validItem,
      category: 'invalid_category',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid unit', () => {
    const result = itemSuggestionSchema.safeParse({
      ...validItem,
      unit: 'gallons',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing name', () => {
    const noName = { ...validItem }
    delete (noName as Record<string, unknown>).name
    const result = itemSuggestionSchema.safeParse(noName)
    expect(result.success).toBe(false)
  })

  it('rejects missing category', () => {
    const noCat = { ...validItem }
    delete (noCat as Record<string, unknown>).category
    const result = itemSuggestionSchema.safeParse(noCat)
    expect(result.success).toBe(false)
  })

  it('rejects zero quantity', () => {
    const result = itemSuggestionSchema.safeParse({
      ...validItem,
      quantity: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const result = itemSuggestionSchema.safeParse({
      ...validItem,
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })

  it('accepts decimal quantity (e.g. 0.5 kg)', () => {
    const result = itemSuggestionSchema.safeParse({
      ...validItem,
      quantity: 2.5,
    })
    expect(result.success).toBe(true)
  })
})
