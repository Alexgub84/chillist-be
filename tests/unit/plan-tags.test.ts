import { describe, it, expect } from 'vitest'
import { getPlanTags } from '../../src/services/plan-tags.service.js'

describe('getPlanTags', () => {
  it('returns an object with the expected top-level keys', () => {
    const tags = getPlanTags()
    expect(typeof tags).toBe('object')
    expect(tags).toHaveProperty('version')
    expect(tags).toHaveProperty('selection_by_tier')
    expect(tags).toHaveProperty('tier1')
    expect(tags).toHaveProperty('universal_flags')
    expect(tags).toHaveProperty('tier2_axes')
    expect(tags).toHaveProperty('tier3')
    expect(tags).toHaveProperty('item_generation_bundles')
  })

  it('version is 1.4', () => {
    const tags = getPlanTags()
    expect(tags['version']).toBe('1.4')
  })

  it('selection_by_tier matches nested select fields for flags and axes', () => {
    const tags = getPlanTags()
    const sel = tags['selection_by_tier'] as {
      universal_flags: { flags: Record<string, { select: string }> }
      tier2_axes: { axes: Record<string, { select: string }> }
    }
    const uf = tags['universal_flags'] as Record<string, { select: string }>
    const axes = tags['tier2_axes'] as Record<string, { select: string }>

    expect(Object.keys(sel.universal_flags.flags).sort()).toEqual(
      Object.keys(uf).sort()
    )
    for (const k of Object.keys(uf)) {
      expect(sel.universal_flags.flags[k].select).toBe(uf[k].select)
    }

    expect(Object.keys(sel.tier2_axes.axes).sort()).toEqual(
      Object.keys(axes).sort()
    )
    for (const k of Object.keys(axes)) {
      expect(sel.tier2_axes.axes[k].select).toBe(axes[k].select)
    }

    expect(sel.tier1.select).toBe('single')
    expect((tags['tier1'] as { select: string }).select).toBe('single')

    const t3 = tags['tier3'] as {
      default_select: string
      multi_select_parents: string[]
    }
    const selT3 = sel.tier3 as {
      default_select: string
      multi_select_parents: string[]
    }
    expect(selT3.default_select).toBe(t3.default_select)
    expect(selT3.multi_select_parents).toEqual(t3.multi_select_parents)
  })

  it('tier1 has options array with id, bilingual label, emoji on each entry', () => {
    const tags = getPlanTags()
    const tier1 = tags['tier1'] as {
      options: Array<{
        id: string
        label: { en: string; he: string }
        emoji: string
      }>
    }
    expect(Array.isArray(tier1.options)).toBe(true)
    expect(tier1.options.length).toBeGreaterThan(0)
    for (const opt of tier1.options) {
      expect(typeof opt.id).toBe('string')
      expect(typeof opt.label).toBe('object')
      expect(typeof opt.label.en).toBe('string')
      expect(typeof opt.label.he).toBe('string')
      expect(typeof opt.emoji).toBe('string')
    }
  })

  it('tier2_axes is an object with at least one axis', () => {
    const tags = getPlanTags()
    const axes = tags['tier2_axes'] as Record<string, unknown>
    expect(typeof axes).toBe('object')
    expect(Object.keys(axes).length).toBeGreaterThan(0)
  })

  it('tier3 has options_by_parent mapping and multi_select_parents array', () => {
    const tags = getPlanTags()
    const tier3 = tags['tier3'] as {
      options_by_parent: Record<string, unknown>
      multi_select_parents: string[]
    }
    expect(typeof tier3.options_by_parent).toBe('object')
    expect(Array.isArray(tier3.multi_select_parents)).toBe(true)
    expect(tier3.multi_select_parents).toContain('booked_activity')
  })

  it('group_character flag has contradictions array with valid pairs', () => {
    const tags = getPlanTags()
    const flag = (tags['universal_flags'] as Record<string, unknown>)[
      'group_character'
    ] as { contradictions: string[][] }
    expect(Array.isArray(flag.contradictions)).toBe(true)
    expect(flag.contradictions.length).toBeGreaterThan(0)
    for (const pair of flag.contradictions) {
      expect(pair).toHaveLength(2)
      expect(typeof pair[0]).toBe('string')
      expect(typeof pair[1]).toBe('string')
    }
  })

  it('returns the same reference on every call (cached)', () => {
    expect(getPlanTags()).toBe(getPlanTags())
  })
})
