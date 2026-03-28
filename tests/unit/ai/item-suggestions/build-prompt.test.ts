import { describe, it, expect } from 'vitest'
import { buildItemSuggestionsPrompt } from '../../../../src/services/ai/item-suggestions/build-prompt.js'
import {
  EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
} from '../../../../src/services/ai/subcategories.js'
import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../../../../src/db/schema.js'

const basePlan = {
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

describe('buildItemSuggestionsPrompt', () => {
  it('includes plan title in the prompt', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('Summer camping')
  })

  it('includes nights count when dates are provided', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('3 nights')
  })

  it('includes location text', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('Lake Tahoe')
    expect(prompt).toContain('South Lake Tahoe')
  })

  it('includes activity tags', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('camping')
    expect(prompt).toContain('hiking')
  })

  it('includes participant count breakdown', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('2 adult(s)')
    expect(prompt).toContain('1 kid(s)')
    expect(prompt).toContain('3 people total')
  })

  it('includes every equipment subcategory label', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    for (const sub of EQUIPMENT_SUBCATEGORIES) {
      expect(prompt).toContain(sub)
    }
  })

  it('includes every food subcategory label', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    for (const sub of FOOD_SUBCATEGORIES) {
      expect(prompt).toContain(sub)
    }
  })

  it('mentions valid categories from DB schema', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    for (const cat of ITEM_CATEGORY_VALUES) {
      expect(prompt).toContain(cat)
    }
  })

  it('includes category rules explaining group vs personal vs food', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('group_equipment')
    expect(prompt).toContain('shared items the group needs ONE of')
    expect(prompt).toContain('personal_equipment')
    expect(prompt).toContain('each person needs their OWN copy')
    expect(prompt).toContain('ALWAYS set quantity to exactly 1')
    expect(prompt).toContain('food')
    expect(prompt).toContain('total amount for the whole group')
  })

  it('mentions valid units from DB schema', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    for (const unit of UNIT_VALUES) {
      expect(prompt).toContain(unit)
    }
  })

  it('omits duration line when no dates', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      startDate: null,
      endDate: null,
    })
    expect(prompt).not.toContain('Trip duration')
  })

  it('omits location when location is null', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      location: null,
    })
    expect(prompt).not.toContain('Lake Tahoe')
    expect(prompt).not.toContain('Location / destination')
  })

  it('omits activity tags when tags are empty', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      tags: [],
    })
    expect(prompt).not.toContain('Activity tags')
  })

  it('omits activity tags when tags are null', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      tags: null,
    })
    expect(prompt).not.toContain('Activity tags')
  })

  it('says "not specified" when both participant counts are zero', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      estimatedAdults: 0,
      estimatedKids: 0,
    })
    expect(prompt).toMatch(/not specified/i)
  })

  it('says "not specified" when both participant counts are null', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      estimatedAdults: null,
      estimatedKids: null,
    })
    expect(prompt).toMatch(/not specified/i)
  })

  it('includes context guidance for how to use duration, location, tags, group size', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('How to use the context above')
    expect(prompt).toContain('Duration')
    expect(prompt).toContain('day trip')
    expect(prompt).toContain('Scale food quantities')
    expect(prompt).toContain('Location')
    expect(prompt).toContain('Tags')
    expect(prompt).toContain('Group size')
  })

  it('labels same-day trips as "Day trip (no overnight stay)"', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      startDate: new Date('2026-07-01T08:00:00.000Z'),
      endDate: new Date('2026-07-01T20:00:00.000Z'),
    })
    expect(prompt).toContain('Day trip (no overnight stay)')
  })

  it('labels single-night trips as "1 night (overnight stay)"', () => {
    const prompt = buildItemSuggestionsPrompt({
      ...basePlan,
      startDate: new Date('2026-07-01T12:00:00.000Z'),
      endDate: new Date('2026-07-02T12:00:00.000Z'),
    })
    expect(prompt).toContain('1 night (overnight stay)')
  })

  it('returns a string', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('includes English output language instruction by default', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan)
    expect(prompt).toContain('Output language:')
    expect(prompt).toContain('English')
  })

  it('includes Hebrew output language instruction when lang is he', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan, 'he')
    expect(prompt).toContain('Hebrew')
    expect(prompt).toContain('עברית')
    expect(prompt).toContain('item name, subcategory, and reason')
    expect(prompt).not.toContain('Subcategory MUST stay in English')
  })

  it('includes Spanish output language instruction when lang is es', () => {
    const prompt = buildItemSuggestionsPrompt(basePlan, 'es')
    expect(prompt).toContain('Spanish')
    expect(prompt).toContain('Español')
    expect(prompt).toContain('item name, subcategory, and reason')
    expect(prompt).not.toContain('Subcategory MUST stay in English')
  })
})
