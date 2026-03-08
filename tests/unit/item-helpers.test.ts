import { describe, it, expect } from 'vitest'
import {
  resolveItemUnit,
  resolveItemUnitForUpdate,
  classifyDbError,
} from '../../src/utils/item-helpers.js'

describe('resolveItemUnit', () => {
  it('returns pcs for equipment regardless of unit', () => {
    const result = resolveItemUnit('equipment')
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns pcs for equipment even when a different unit is supplied', () => {
    const result = resolveItemUnit('equipment', 'kg')
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

  it('forces pcs when category changes to equipment', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', {
      category: 'equipment',
    })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('returns error when setting non-pcs unit on equipment item', () => {
    const result = resolveItemUnitForUpdate('equipment', 'pcs', { unit: 'kg' })
    expect(result).toEqual({
      error: 'Equipment items must use pcs as the unit',
    })
  })

  it('allows pcs unit explicitly on equipment item', () => {
    const result = resolveItemUnitForUpdate('equipment', 'pcs', { unit: 'pcs' })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('uses new unit when changing food unit', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', { unit: 'l' })
    expect(result).toEqual({ unit: 'l' })
  })

  it('keeps existing unit when changing to food without specifying unit', () => {
    const result = resolveItemUnitForUpdate('equipment', 'pcs', {
      category: 'food',
    })
    expect(result).toEqual({ unit: 'pcs' })
  })

  it('uses new unit when changing to food with a unit', () => {
    const result = resolveItemUnitForUpdate('equipment', 'pcs', {
      category: 'food',
      unit: 'kg',
    })
    expect(result).toEqual({ unit: 'kg' })
  })

  it('returns pcs when changing to equipment with a unit param that gets overridden', () => {
    const result = resolveItemUnitForUpdate('food', 'kg', {
      category: 'equipment',
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
