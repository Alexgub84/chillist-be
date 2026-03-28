import { describe, it, expect } from 'vitest'
import {
  buildPlanAiContext,
  formatLocationForAi,
  normalizeTagsForAi,
  resolveLocationTextForAi,
  resolveParticipantEstimates,
} from '../../../src/services/ai/plan-context-formatters.js'
import {
  EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
} from '../../../src/services/ai/subcategories.js'

describe('formatLocationForAi', () => {
  it('joins name, city, region, country with non-empty parts only', () => {
    expect(
      formatLocationForAi({
        locationId: 'x',
        name: 'Lake Tahoe',
        city: 'South Lake Tahoe',
        region: 'California',
        country: 'USA',
      })
    ).toBe('Lake Tahoe, South Lake Tahoe, California, USA')
  })

  it('skips empty or missing optional fields', () => {
    expect(
      formatLocationForAi({
        locationId: 'x',
        name: 'Paris',
        country: 'France',
      })
    ).toBe('Paris, France')
  })
})

describe('resolveLocationTextForAi', () => {
  it('returns undefined when location is null or missing name', () => {
    expect(resolveLocationTextForAi(null)).toBeUndefined()
    expect(
      resolveLocationTextForAi({
        locationId: 'x',
        name: '   ',
      })
    ).toBeUndefined()
  })

  it('returns formatted string when name is present', () => {
    expect(
      resolveLocationTextForAi({
        locationId: 'x',
        name: 'Tahoe',
        city: 'South Lake Tahoe',
      })
    ).toBe('Tahoe, South Lake Tahoe')
  })
})

describe('normalizeTagsForAi', () => {
  it('trims and drops empty strings', () => {
    expect(normalizeTagsForAi(['  a ', '', 'b', '  '])).toEqual(['a', 'b'])
  })

  it('returns empty array for null or undefined', () => {
    expect(normalizeTagsForAi(null)).toEqual([])
    expect(normalizeTagsForAi(undefined)).toEqual([])
  })
})

describe('resolveParticipantEstimates', () => {
  it('nulls become zero and total is sum', () => {
    expect(resolveParticipantEstimates(null, null)).toEqual({
      adults: 0,
      kids: 0,
      total: 0,
    })
    expect(resolveParticipantEstimates(2, 1)).toEqual({
      adults: 2,
      kids: 1,
      total: 3,
    })
  })
})

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

describe('buildPlanAiContext', () => {
  it('includes plan title, nights, location, tags, participant total in prompt', () => {
    const ctx = buildPlanAiContext(basePlan)
    expect(ctx.planTitle).toBe('Summer camping')
    expect(ctx.nightsCount).toBe(3)
    expect(ctx.location).toContain('Lake Tahoe')
    expect(ctx.location).toContain('South Lake Tahoe')
    expect(ctx.tags).toEqual(['camping', 'hiking'])
    expect(ctx.totalParticipants).toBe(3)
    expect(ctx.prompt).toContain('Summer camping')
    expect(ctx.prompt).toContain('3')
    expect(ctx.prompt).toMatch(/night|nights/i)
    expect(ctx.prompt).toContain('camping')
    expect(ctx.prompt).toContain('hiking')
  })

  it('includes every equipment subcategory label in the prompt', () => {
    const ctx = buildPlanAiContext(basePlan)
    for (const sub of EQUIPMENT_SUBCATEGORIES) {
      expect(ctx.prompt).toContain(sub)
    }
  })

  it('includes every food subcategory label in the prompt', () => {
    const ctx = buildPlanAiContext(basePlan)
    for (const sub of FOOD_SUBCATEGORIES) {
      expect(ctx.prompt).toContain(sub)
    }
  })

  it('omits duration when no dates', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      startDate: null,
      endDate: null,
    })
    expect(ctx.nightsCount).toBeUndefined()
    expect(ctx.prompt).not.toMatch(/\d+\s+nights?/i)
  })

  it('omits location line when location is null', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      location: null,
    })
    expect(ctx.location).toBeUndefined()
    expect(ctx.prompt).not.toContain('Lake Tahoe')
  })

  it('omits activity tags when tags empty or null', () => {
    const empty = buildPlanAiContext({ ...basePlan, tags: [] })
    expect(empty.tags).toEqual([])
    expect(empty.prompt).not.toMatch(/Activity tags:/)

    const nullTags = buildPlanAiContext({ ...basePlan, tags: null })
    expect(nullTags.tags).toEqual([])
  })

  it('handles zero adults and zero kids', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      estimatedAdults: 0,
      estimatedKids: 0,
    })
    expect(ctx.totalParticipants).toBe(0)
    expect(ctx.prompt).toMatch(/0|unknown|not specified/i)
  })

  it('handles only adults', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      estimatedAdults: 4,
      estimatedKids: 0,
    })
    expect(ctx.totalParticipants).toBe(4)
    expect(ctx.prompt).toContain('4')
  })

  it('handles only kids', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      estimatedAdults: 0,
      estimatedKids: 2,
    })
    expect(ctx.totalParticipants).toBe(2)
  })

  it('treats null estimated counts as zero', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      estimatedAdults: null,
      estimatedKids: null,
    })
    expect(ctx.totalParticipants).toBe(0)
  })

  it('same calendar day for start and end yields zero nights', () => {
    const ctx = buildPlanAiContext({
      ...basePlan,
      startDate: new Date('2026-07-01T08:00:00.000Z'),
      endDate: new Date('2026-07-01T20:00:00.000Z'),
    })
    expect(ctx.nightsCount).toBe(0)
  })
})
