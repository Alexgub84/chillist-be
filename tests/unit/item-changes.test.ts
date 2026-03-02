import { describe, it, expect } from 'vitest'
import { computeItemDiff } from '../../src/utils/item-changes.js'
import type { Item } from '../../src/db/schema.js'

describe('computeItemDiff', () => {
  const baseItem: Pick<
    Item,
    | 'name'
    | 'category'
    | 'quantity'
    | 'unit'
    | 'status'
    | 'subcategory'
    | 'notes'
    | 'assignedParticipantId'
  > = {
    name: 'Tent',
    category: 'equipment',
    quantity: 2,
    unit: 'pcs',
    status: 'pending',
    subcategory: null,
    notes: null,
    assignedParticipantId: null,
  }

  it('returns diff for single field change', () => {
    const diff = computeItemDiff(baseItem, { status: 'purchased' })
    expect(diff).toHaveLength(1)
    expect(diff[0]).toEqual({
      field: 'status',
      from: 'pending',
      to: 'purchased',
    })
  })

  it('returns diff for multiple field changes', () => {
    const diff = computeItemDiff(baseItem, {
      status: 'packed',
      quantity: 3,
      notes: 'Ready',
    })
    expect(diff).toHaveLength(3)
    expect(diff).toContainEqual({
      field: 'status',
      from: 'pending',
      to: 'packed',
    })
    expect(diff).toContainEqual({ field: 'quantity', from: 2, to: 3 })
    expect(diff).toContainEqual({
      field: 'notes',
      from: null,
      to: 'Ready',
    })
  })

  it('returns empty array when values are unchanged', () => {
    const diff = computeItemDiff(baseItem, {
      status: 'pending',
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
