import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ITEM_QUANTITY_SOURCE,
  resolveItemQuantitySource,
  withItemQuantitySourceDefault,
} from '../../src/utils/plan.js'

describe('plan utils', () => {
  describe('resolveItemQuantitySource', () => {
    it('returns "estimated" when value is null', () => {
      expect(resolveItemQuantitySource(null)).toBe('estimated')
    })

    it('returns "estimated" when value is undefined', () => {
      expect(resolveItemQuantitySource(undefined)).toBe('estimated')
    })

    it('returns the value unchanged for "estimated"', () => {
      expect(resolveItemQuantitySource('estimated')).toBe('estimated')
    })

    it('returns the value unchanged for "participant_reported"', () => {
      expect(resolveItemQuantitySource('participant_reported')).toBe(
        'participant_reported'
      )
    })

    it('default constant is "estimated"', () => {
      expect(DEFAULT_ITEM_QUANTITY_SOURCE).toBe('estimated')
    })
  })

  describe('withItemQuantitySourceDefault', () => {
    it('fills in "estimated" when row has null itemQuantitySource', () => {
      const row = { planId: 'abc', itemQuantitySource: null }
      const result = withItemQuantitySourceDefault(row)
      expect(result.itemQuantitySource).toBe('estimated')
      expect(result.planId).toBe('abc')
    })

    it('fills in "estimated" when row has undefined itemQuantitySource', () => {
      const row = { planId: 'abc' }
      const result = withItemQuantitySourceDefault(row)
      expect(result.itemQuantitySource).toBe('estimated')
    })

    it('keeps non-null itemQuantitySource value', () => {
      const row = {
        planId: 'abc',
        itemQuantitySource: 'participant_reported' as const,
      }
      const result = withItemQuantitySourceDefault(row)
      expect(result.itemQuantitySource).toBe('participant_reported')
    })

    it('preserves all other properties', () => {
      const row = {
        planId: 'abc',
        title: 'Test',
        itemQuantitySource: null,
        nested: { a: 1 },
      }
      const result = withItemQuantitySourceDefault(row)
      expect(result).toEqual({
        planId: 'abc',
        title: 'Test',
        itemQuantitySource: 'estimated',
        nested: { a: 1 },
      })
    })
  })
})
