import { describe, it, expect } from 'vitest'
import { assembleTaxonomyResponse } from '../../src/services/plan-tags.service.js'
import type { TierLabels } from '../../src/db/schema.js'

const TEST_TIER_LABELS: TierLabels = {
  tier1: { label: 'What kind of trip?', key: 'plan_type' },
  tier2: { label: 'More details', key: 'logistics', conditional_on: 'tier1' },
  tier3: { label: 'Specifics', key: 'specifics', conditional_on: 'tier2' },
}

const TEST_VERSION = {
  version: '1.0',
  description: 'Test taxonomy',
  tierLabels: TEST_TIER_LABELS,
}

describe('assembleTaxonomyResponse', () => {
  it('builds correct tier1 options with sort order and emoji', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'beach',
        tier: 1,
        parentId: null,
        label: 'Beach',
        emoji: '🏖️',
        sortOrder: 1,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    expect(result.version).toBe('1.0')
    expect(result.description).toBe('Test taxonomy')
    expect(result.tiers.tier1.options).toHaveLength(2)
    expect(result.tiers.tier1.options[0]).toEqual({
      id: 'camping',
      label: 'Camping',
      emoji: '⛺',
    })
    expect(result.tiers.tier1.options[1]).toEqual({
      id: 'beach',
      label: 'Beach',
      emoji: '🏖️',
    })
  })

  it('sorts options by sortOrder within each tier and parent', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 1,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'beach',
        tier: 1,
        parentId: null,
        label: 'Beach',
        emoji: '🏖️',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_wild',
        tier: 2,
        parentId: 'camping',
        label: 'Wild camping',
        emoji: null,
        sortOrder: 1,
        mutexGroup: 'site',
        crossGroupRules: null,
      },
      {
        id: 'camping_organized',
        tier: 2,
        parentId: 'camping',
        label: 'Organized',
        emoji: null,
        sortOrder: 0,
        mutexGroup: 'site',
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    expect(result.tiers.tier1.options[0].id).toBe('beach')
    expect(result.tiers.tier1.options[1].id).toBe('camping')
    expect(result.tiers.tier2.options_by_parent['camping'].options[0].id).toBe(
      'camping_organized'
    )
    expect(result.tiers.tier2.options_by_parent['camping'].options[1].id).toBe(
      'camping_wild'
    )
  })

  it('groups tier-2 options by parent_id into options_by_parent', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'beach',
        tier: 1,
        parentId: null,
        label: 'Beach',
        emoji: '🏖️',
        sortOrder: 1,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_tent',
        tier: 2,
        parentId: 'camping',
        label: 'Tent',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'beach_hotel',
        tier: 2,
        parentId: 'beach',
        label: 'Hotel',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    expect(Object.keys(result.tiers.tier2.options_by_parent)).toEqual([
      'camping',
      'beach',
    ])
    expect(
      result.tiers.tier2.options_by_parent['camping'].options
    ).toHaveLength(1)
    expect(result.tiers.tier2.options_by_parent['beach'].options).toHaveLength(
      1
    )
  })

  it('reconstructs mutex_groups from mutex_group column', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_tent',
        tier: 2,
        parentId: 'camping',
        label: 'Tent',
        emoji: null,
        sortOrder: 0,
        mutexGroup: 'sleep',
        crossGroupRules: null,
      },
      {
        id: 'camping_cabin',
        tier: 2,
        parentId: 'camping',
        label: 'Cabin',
        emoji: null,
        sortOrder: 1,
        mutexGroup: 'sleep',
        crossGroupRules: null,
      },
      {
        id: 'camping_cooking',
        tier: 2,
        parentId: 'camping',
        label: 'Cooking',
        emoji: null,
        sortOrder: 2,
        mutexGroup: 'food',
        crossGroupRules: null,
      },
      {
        id: 'camping_eating_out',
        tier: 2,
        parentId: 'camping',
        label: 'Eating out',
        emoji: null,
        sortOrder: 3,
        mutexGroup: 'food',
        crossGroupRules: null,
      },
      {
        id: 'camping_organized',
        tier: 2,
        parentId: 'camping',
        label: 'Organized',
        emoji: null,
        sortOrder: 4,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    const block = result.tiers.tier2.options_by_parent['camping']
    expect(block.mutex_groups).toHaveLength(2)
    expect(block.mutex_groups).toContainEqual(['camping_tent', 'camping_cabin'])
    expect(block.mutex_groups).toContainEqual([
      'camping_cooking',
      'camping_eating_out',
    ])
  })

  it('options with no mutex_group are not included in mutex_groups', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_tent',
        tier: 2,
        parentId: 'camping',
        label: 'Tent',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_cabin',
        tier: 2,
        parentId: 'camping',
        label: 'Cabin',
        emoji: null,
        sortOrder: 1,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    expect(
      result.tiers.tier2.options_by_parent['camping'].mutex_groups
    ).toHaveLength(0)
  })

  it('attaches cross_group_rules with trigger field from option id', () => {
    const options = [
      {
        id: 'hotel_trip',
        tier: 1,
        parentId: null,
        label: 'Hotel Stay',
        emoji: '🏨',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'hotel_apartment',
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Airbnb',
        emoji: null,
        sortOrder: 0,
        mutexGroup: 'stay',
        crossGroupRules: [
          {
            disable: ['hotel_hotel_meals'],
            disable_tooltip: 'Hotel meals only with hotel stay',
          },
        ],
      },
      {
        id: 'hotel_hotel_meals',
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Hotel meals',
        emoji: null,
        sortOrder: 1,
        mutexGroup: 'food',
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    const block = result.tiers.tier2.options_by_parent['hotel_trip']
    expect(block.cross_group_rules).toHaveLength(1)
    expect(block.cross_group_rules[0]).toEqual({
      trigger: 'hotel_apartment',
      disable: ['hotel_hotel_meals'],
      disable_tooltip: 'Hotel meals only with hotel stay',
    })
  })

  it('groups tier-3 options by parent_id', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_cooking',
        tier: 2,
        parentId: 'camping',
        label: 'Cooking',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'cooking_shared',
        tier: 3,
        parentId: 'camping_cooking',
        label: 'Shared meals',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'cooking_own',
        tier: 3,
        parentId: 'camping_cooking',
        label: 'Own meals',
        emoji: null,
        sortOrder: 1,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    expect(result.tiers.tier3.options_by_parent['camping_cooking']).toEqual([
      { id: 'cooking_shared', label: 'Shared meals' },
      { id: 'cooking_own', label: 'Own meals' },
    ])
  })

  it('returns empty mutex_groups and cross_group_rules arrays when none exist', () => {
    const options = [
      {
        id: 'camping',
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
      {
        id: 'camping_tent',
        tier: 2,
        parentId: 'camping',
        label: 'Tent',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]

    const result = assembleTaxonomyResponse(TEST_VERSION, options)

    const block = result.tiers.tier2.options_by_parent['camping']
    expect(block.mutex_groups).toEqual([])
    expect(block.cross_group_rules).toEqual([])
  })

  it('uses tier_labels from the version row for tier keys and labels', () => {
    const result = assembleTaxonomyResponse(TEST_VERSION, [])

    expect(result.tiers.tier1.label).toBe('What kind of trip?')
    expect(result.tiers.tier1.key).toBe('plan_type')
    expect(result.tiers.tier2.conditional_on).toBe('tier1')
    expect(result.tiers.tier3.conditional_on).toBe('tier2')
  })

  it('uses empty string for emoji when emoji is null', () => {
    const options = [
      {
        id: 'other',
        tier: 1,
        parentId: null,
        label: 'Other',
        emoji: null,
        sortOrder: 0,
        mutexGroup: null,
        crossGroupRules: null,
      },
    ]
    const result = assembleTaxonomyResponse(TEST_VERSION, options)
    expect(result.tiers.tier1.options[0].emoji).toBe('')
  })
})
