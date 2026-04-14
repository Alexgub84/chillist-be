import { describe, it, expect } from 'vitest'
import { getPlanTags } from '../../src/services/plan-tags.service.js'

describe('getPlanTags', () => {
  it('returns an object with the expected top-level keys', () => {
    const tags = getPlanTags()
    expect(typeof tags).toBe('object')
    expect(tags).toHaveProperty('version')
    expect(tags).toHaveProperty('tier1')
    expect(tags).toHaveProperty('universal_flags')
    expect(tags).toHaveProperty('tier2_axes')
    expect(tags).toHaveProperty('tier3')
    expect(tags).toHaveProperty('item_generation_bundles')
  })

  it('version is a non-empty string', () => {
    const tags = getPlanTags()
    expect(typeof tags['version']).toBe('string')
    expect((tags['version'] as string).length).toBeGreaterThan(0)
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

  it('tier3 has options_by_parent mapping', () => {
    const tags = getPlanTags()
    const tier3 = tags['tier3'] as {
      options_by_parent: Record<string, unknown>
    }
    expect(typeof tier3.options_by_parent).toBe('object')
  })

  it('returns the same reference on every call (cached)', () => {
    expect(getPlanTags()).toBe(getPlanTags())
  })
})
