import { describe, it, expect } from 'vitest'
import { resolveLanguageModel } from '../../../src/services/ai/model-provider.js'

describe('resolveLanguageModel', () => {
  it('uses Haiku for Anthropic English', () => {
    const m = resolveLanguageModel('anthropic', 'en')
    expect(m.modelId).toContain('haiku')
  })

  it('uses Sonnet for Anthropic Hebrew', () => {
    const m = resolveLanguageModel('anthropic', 'he')
    expect(m.modelId).toContain('sonnet')
  })

  it('uses gpt-4o-mini for OpenAI English', () => {
    const m = resolveLanguageModel('openai', 'en')
    expect(m.modelId).toContain('gpt-4o-mini')
  })

  it('uses gpt-4o for OpenAI Spanish', () => {
    const m = resolveLanguageModel('openai', 'es')
    expect(m.modelId).toContain('gpt-4o')
    expect(m.modelId).not.toContain('mini')
  })
})
