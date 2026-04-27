import { describe, it, expect } from 'vitest'
import {
  GROUP_EQUIPMENT_SUBCATEGORIES,
  PERSONAL_EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
  EQUIPMENT_SUBCATEGORIES,
} from '../../../src/services/ai/subcategories.js'

// ─── group_equipment ────────────────────────────────────────────────────────

describe('GROUP_EQUIPMENT_SUBCATEGORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(GROUP_EQUIPMENT_SUBCATEGORIES.length).toBeGreaterThan(0)
    for (const value of GROUP_EQUIPMENT_SUBCATEGORIES) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    'Venue Setup and Layout',
    'Food Preparation Tools',
    'Cooking and Heating Equipment',
    'Cookware and Bakeware',
    'Serving and Tableware',
    'Drink and Beverage Equipment',
    'Food Storage and Cooling',
    'Cleaning and Dishwashing',
    'Waste and Recycling',
    'Power and Charging',
    'Lighting and Visibility',
    'Comfort and Climate Control',
    'Music and Media',
    'Games and Activities',
    'Kids and Baby Gear',
    'Pet Gear',
    'Hygiene and Bathroom Supplies',
    'First Aid and Safety',
    'Transport and Carry',
    'Documentation and Access',
    'Tools and Quick Repairs',
  ])('includes canonical FE label: %s', (value) => {
    expect(GROUP_EQUIPMENT_SUBCATEGORIES).toContain(value)
  })

  it.each([
    'Sleep System',
    'Shelter and Sleeping Setup',
    'Clothing Layers',
    'Hiking Gear',
    'Hydration',
    'Carrying and Storage',
    'Storage and Organization',
    'Cooking and Dining',
    'Footwear and Protection',
    'Sleeping Gear',
    'Hygiene and Toiletries',
  ])(
    'does NOT include personal_equipment or non-canonical label: %s',
    (value) => {
      expect(GROUP_EQUIPMENT_SUBCATEGORIES).not.toContain(value)
    }
  )
})

// ─── personal_equipment ─────────────────────────────────────────────────────

describe('PERSONAL_EQUIPMENT_SUBCATEGORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(PERSONAL_EQUIPMENT_SUBCATEGORIES.length).toBeGreaterThan(0)
    for (const value of PERSONAL_EQUIPMENT_SUBCATEGORIES) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    'Sleeping Gear',
    'Clothing and Layers',
    'Footwear',
    'Headwear and Accessories',
    'Hygiene and Toiletries',
    'Packs and Hydration',
    'Kids Gear',
    'Personal Essentials',
  ])('includes canonical FE label: %s', (value) => {
    expect(PERSONAL_EQUIPMENT_SUBCATEGORIES).toContain(value)
  })

  it.each([
    'Cooking and Heating Equipment',
    'First Aid and Safety',
    'Kids and Baby Gear',
    'Lighting and Visibility',
    'Hydration',
    'Sleep System',
  ])('does NOT include group_equipment or non-canonical label: %s', (value) => {
    expect(PERSONAL_EQUIPMENT_SUBCATEGORIES).not.toContain(value)
  })
})

// ─── food ────────────────────────────────────────────────────────────────────

describe('FOOD_SUBCATEGORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(FOOD_SUBCATEGORIES.length).toBeGreaterThan(0)
    for (const value of FOOD_SUBCATEGORIES) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    'Fresh Vegetables',
    'Fresh Fruit',
    'Fresh Herbs',
    'Leafy Greens and Salads',
    'Aromatics (onion, garlic, ginger)',
    'Meat and Poultry',
    'Fish and Seafood',
    'Meat Alternatives and Plant Proteins',
    'Vegan',
    'Eggs',
    'Dairy',
    'Dairy Alternatives',
    'Cheese',
    'Bread and Bakery',
    'Grains and Pasta',
    'Breakfast Staples',
    'Legumes (dry and canned)',
    'Canned and Jarred Foods',
    'Sauces, Condiments, and Spreads',
    'Oils, Vinegars, and Dressings',
    'Spices and Seasonings',
    'Baking Ingredients',
    'Snacks and Chips',
    'Nuts, Seeds, and Dried Fruit',
    'Sweets and Desserts',
    'Frozen Foods',
    'Ready-to-Eat and Prepared Foods',
    'Beverages (non-alcoholic)',
    'Alcohol and Mixers',
    'Hot Drinks (coffee, tea, cocoa)',
    'Water and Ice',
  ])('includes canonical FE label: %s', (value) => {
    expect(FOOD_SUBCATEGORIES).toContain(value)
  })

  it.each([
    'Meat and Proteins',
    'Fresh Produce',
    'Condiments and Spices',
    'Grains and Bread',
    'Grains and Staples',
    'Beverages (alcoholic)',
  ])('does NOT include non-canonical label: %s', (value) => {
    expect(FOOD_SUBCATEGORIES).not.toContain(value)
  })
})

// ─── legacy alias ────────────────────────────────────────────────────────────

describe('EQUIPMENT_SUBCATEGORIES (legacy alias)', () => {
  it('is the same reference as GROUP_EQUIPMENT_SUBCATEGORIES', () => {
    expect(EQUIPMENT_SUBCATEGORIES).toBe(GROUP_EQUIPMENT_SUBCATEGORIES)
  })
})
