import { describe, it, expect } from 'vitest'
import {
  resolveItemUnit,
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
