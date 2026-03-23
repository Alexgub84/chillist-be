import { describe, it, expect } from 'vitest'
import { computeItemDiff } from '../../src/utils/item-changes.js'
import type { Item } from '../../src/db/schema.js'

describe('computeItemDiff', () => {
  const baseItem: Pick<
    Item,
    'name' | 'category' | 'quantity' | 'unit' | 'subcategory' | 'notes'
  > = {
    name: 'Tent',
    category: 'group_equipment',
    quantity: 2,
    unit: 'pcs',
    subcategory: null,
    notes: null,
  }

  it('returns diff for single field change', () => {
    const diff = computeItemDiff(baseItem, { name: 'Big Tent' })
    expect(diff).toHaveLength(1)
    expect(diff[0]).toEqual({
      field: 'name',
      from: 'Tent',
      to: 'Big Tent',
    })
  })

  it('returns diff for multiple field changes', () => {
    const diff = computeItemDiff(baseItem, {
      quantity: 3,
      notes: 'Ready',
    })
    expect(diff).toHaveLength(2)
    expect(diff).toContainEqual({ field: 'quantity', from: 2, to: 3 })
    expect(diff).toContainEqual({
      field: 'notes',
      from: null,
      to: 'Ready',
    })
  })

  it('returns empty array when values are unchanged', () => {
    const diff = computeItemDiff(baseItem, {
      name: 'Tent',
      quantity: 2,
    })
    expect(diff).toHaveLength(0)
  })

  it('ignores fields not in updates', () => {
    const diff = computeItemDiff(baseItem, {})
    expect(diff).toHaveLength(0)
  })

  it('tracks null to value change', () => {
    const diff = computeItemDiff(baseItem, { notes: 'Bring extra' })
    expect(diff).toHaveLength(1)
    expect(diff[0]).toEqual({
      field: 'notes',
      from: null,
      to: 'Bring extra',
    })
  })

  it('tracks value to null change', () => {
    const withNotes = { ...baseItem, notes: 'Something' }
    const diff = computeItemDiff(withNotes, { notes: null })
    expect(diff).toHaveLength(1)
    expect(diff[0]).toEqual({
      field: 'notes',
      from: 'Something',
      to: null,
    })
  })
})
