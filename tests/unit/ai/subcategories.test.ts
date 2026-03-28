import { describe, it, expect } from 'vitest'
import {
  EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
} from '../../../src/services/ai/subcategories.js'

describe('EQUIPMENT_SUBCATEGORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(EQUIPMENT_SUBCATEGORIES.length).toBeGreaterThan(0)
    for (const value of EQUIPMENT_SUBCATEGORIES) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    'Venue Setup and Layout',
    'Comfort and Climate Control',
    'Cooking and Heating Equipment',
    'First Aid and Safety',
    'Games and Activities',
    'Food Storage and Cooling',
    'Lighting and Visibility',
    'Kids and Baby Gear',
    'Drink and Beverage Equipment',
    'Other',
  ])('includes known seed value: %s', (value) => {
    expect(EQUIPMENT_SUBCATEGORIES).toContain(value)
  })
})

describe('FOOD_SUBCATEGORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(FOOD_SUBCATEGORIES.length).toBeGreaterThan(0)
    for (const value of FOOD_SUBCATEGORIES) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    'Beverages (non-alcoholic)',
    'Beverages (alcoholic)',
    'Grains and Pasta',
    'Snacks and Chips',
    'Breakfast Staples',
    'Meat and Proteins',
    'Vegan',
    'Fresh Produce',
    'Other',
  ])('includes known seed value: %s', (value) => {
    expect(FOOD_SUBCATEGORIES).toContain(value)
  })
})
