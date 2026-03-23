import { describe, it, expect } from 'vitest'
import {
  resolveItemUnit,
  resolveItemUnitForUpdate,
  classifyDbError,
  normalizeCategory,
  isEquipmentCategory,
} from '../../src/utils/item-helpers.js'

describe('resolveItemUnit', () => {
  it('returns pcs for group_equipment regardless of unit', () => {
    const result = resolveItemUnit('group_equipment')
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns pcs for group_equipment even when a different unit is supplied', () => {
    const result = resolveItemUnit('group_equipment', 'kg')
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns pcs for personal_equipment regardless of unit', () => {
    const result = resolveItemUnit('personal_equipment')
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns pcs for personal_equipment even when a different unit is supplied', () => {
    const result = resolveItemUnit('personal_equipment', 'kg')
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns the given unit for food', () => {
    const result = resolveItemUnit('food', 'kg')
    expect(result).toEqual({ unit: 'kg' })
  })

  it.each(['kg', 'g', 'l', 'ml', 'pcs'] as const)(
    'returns %s for food when supplied',
    (unit) => {
      const result = resolveItemUnit('food', unit)
      expect(result).toEqual({ unit })
    }
  )

  it('returns error when food has no unit', () => {
    const result = resolveItemUnit('food')
    expect(result).toEqual({ error: 'Unit is required for food items' })
  })

  it('returns error when food unit is undefined', () => {
    const result = resolveItemUnit('food', undefined)
    expect(result).toEqual({ error: 'Unit is required for food items' })
  })
})

describe('resolveItemUnitForUpdate', () => {
  it('returns null when neither category nor unit is being changed', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', {})
    expect(result).toBeNull()
  })

  it('forces pcs when category changes to group_equipment', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', {
      category: 'group_equipment',
    })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('forces pcs when category changes to personal_equipment', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', {
      category: 'personal_equipment',
    })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns error when setting non-pcs unit on group_equipment item', () => {
    const result = resolveItemUnitForUpdate('group_equipment', 'pcs', {
      unit: 'kg',
    })
    expect(result).toEqual({
      error: 'Equipment items must use pcs as the unit',
    })
  })

  it('returns error when setting non-pcs unit on personal_equipment item', () => {
    const result = resolveItemUnitForUpdate('personal_equipment', 'pcs', {
      unit: 'kg',
    })
    expect(result).toEqual({
      error: 'Equipment items must use pcs as the unit',
    })
  })

  it('allows pcs unit explicitly on group_equipment item', () => {
    const result = resolveItemUnitForUpdate('group_equipment', 'pcs', {
      unit: 'pcs',
    })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('uses new unit when changing food unit', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', { unit: 'l' })
    expect(result).toEqual({ unit: 'l' })
  })

  it('keeps existing unit when changing to food without specifying unit', () => {
    const result = resolveItemUnitForUpdate('group_equipment', 'pcs', {
      category: 'food',
    })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('uses new unit when changing to food with a unit', () => {
    const result = resolveItemUnitForUpdate('group_equipment', 'pcs', {
      category: 'food',
      unit: 'kg',
    })
    expect(result).toEqual({ unit: 'kg' })
  })

  it('returns error when changing to group_equipment with a non-pcs unit', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', {
      category: 'group_equipment',
      unit: 'kg',
    })
    expect(result).toEqual({
      error: 'Equipment items must use pcs as the unit',
    })
  })

  it('keeps existing food unit when only other fields change', () => {
    const result = resolveItemUnitForUpdate('food', 'ml', { unit: undefined })
    expect(result).toBeNull()
  })
})

describe('normalizeCategory', () => {
  it('maps legacy equipment to group_equipment', () => {
    expect(normalizeCategory('equipment')).toBe('group_equipment')
  })

  it('passes through group_equipment unchanged', () => {
    expect(normalizeCategory('group_equipment')).toBe('group_equipment')
  })

  it('passes through personal_equipment unchanged', () => {
    expect(normalizeCategory('personal_equipment')).toBe('personal_equipment')
  })

  it('passes through food unchanged', () => {
    expect(normalizeCategory('food')).toBe('food')
  })
})

describe('isEquipmentCategory', () => {
  it('returns true for group_equipment', () => {
    expect(isEquipmentCategory('group_equipment')).toBe(true)
  })

  it('returns true for personal_equipment', () => {
    expect(isEquipmentCategory('personal_equipment')).toBe(true)
  })

  it('returns false for food', () => {
    expect(isEquipmentCategory('food')).toBe(false)
  })
})

describe('classifyDbError', () => {
  it.each([
    ['connect ECONNREFUSED', 503, 'Database connection error'],
    ['connection timeout', 503, 'Database connection error'],
    ['socket connection failed', 503, 'Database connection error'],
    ['request timeout exceeded', 503, 'Database connection error'],
  ])(
    'classifies "%s" as %d',
    (errorMessage, expectedStatus, expectedMessage) => {
      const result = classifyDbError(
        new Error(errorMessage),
        'Fallback message'
      )
      expect(result).toEqual({
        statusCode: expectedStatus,
        message: expectedMessage,
      })
    }
  )

  it('returns 500 with fallback message for generic errors', () => {
    const result = classifyDbError(
      new Error('unique constraint violation'),
      'Failed to create item'
    )
    expect(result).toEqual({
      statusCode: 500,
      message: 'Failed to create item',
    })
  })

  it('returns 500 with fallback message for non-Error thrown values', () => {
    const result = classifyDbError('string error', 'Failed to update item')
    expect(result).toEqual({
      statusCode: 500,
      message: 'Failed to update item',
    })
  })

  it('returns 500 with fallback message for null', () => {
    const result = classifyDbError(null, 'Operation failed')
    expect(result).toEqual({ statusCode: 500, message: 'Operation failed' })
  })

  it('returns 500 with fallback message for undefined', () => {
    const result = classifyDbError(undefined, 'Operation failed')
    expect(result).toEqual({ statusCode: 500, message: 'Operation failed' })
  })
})
