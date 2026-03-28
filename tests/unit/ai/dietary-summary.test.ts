import { describe, it, expect } from 'vitest'
import { aggregateDietarySummary } from '../../../src/services/ai/dietary-summary.js'

describe('aggregateDietarySummary', () => {
  it('returns undefined for empty rows', () => {
    expect(aggregateDietarySummary([])).toBeUndefined()
  })

  it('aggregates diets from dietaryMembers', () => {
    const s = aggregateDietarySummary([
      {
        foodPreferences: null,
        dietaryMembers: {
          members: [
            {
              type: 'adult',
              index: 0,
              diet: 'vegan',
              allergies: ['none'],
            },
            {
              type: 'adult',
              index: 1,
              diet: 'vegetarian',
              allergies: ['none'],
            },
          ],
        },
      },
    ])
    expect(s).toContain('vegan')
    expect(s).toContain('vegetarian')
  })

  it('parses JSON array in foodPreferences when dietaryMembers is null', () => {
    const s = aggregateDietarySummary([
      {
        foodPreferences:
          '[{"type":"adult","index":0,"diet":"vegan"},{"type":"kid","index":0,"diet":"everything"}]',
        dietaryMembers: null,
      },
    ])
    expect(s).toContain('vegan')
    expect(s).toContain('no dietary restrictions')
  })

  it('accepts plain diet string in foodPreferences', () => {
    const s = aggregateDietarySummary([
      { foodPreferences: 'kosher', dietaryMembers: null },
    ])
    expect(s).toContain('kosher')
  })
})
