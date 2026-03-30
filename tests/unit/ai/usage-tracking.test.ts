import { describe, it, expect, vi } from 'vitest'
import {
  estimateModelCost,
  recordAiUsage,
  MODEL_PRICING,
} from '../../../src/services/ai/usage-tracking.js'
import { resolveLanguageModel } from '../../../src/services/ai/model-provider.js'

describe('estimateModelCost', () => {
  it('computes cost for known Anthropic Haiku model', () => {
    const cost = estimateModelCost('claude-haiku-4-5-20251001', 2000, 800)
    expect(cost).toBeCloseTo(0.0016 + 0.0032, 6)
  })

  it('computes cost for known Anthropic Sonnet model', () => {
    const cost = estimateModelCost('claude-sonnet-4-20250514', 1000, 1000)
    expect(cost).toBeCloseTo(0.003 + 0.015, 6)
  })

  it('computes cost for known OpenAI gpt-4o-mini model', () => {
    const cost = estimateModelCost('gpt-4o-mini', 10000, 5000)
    expect(cost).toBeCloseTo(0.0015 + 0.003, 6)
  })

  it('computes cost for known OpenAI gpt-4o model', () => {
    const cost = estimateModelCost('gpt-4o', 1000, 500)
    expect(cost).toBeCloseTo(0.0025 + 0.005, 6)
  })

  it('returns null for unknown model', () => {
    const cost = estimateModelCost('unknown:model-v1', 1000, 500)
    expect(cost).toBeNull()
  })

  it('returns null when both token counts are undefined', () => {
    const cost = estimateModelCost(
      'claude-haiku-4-5-20251001',
      undefined,
      undefined
    )
    expect(cost).toBeNull()
  })

  it('handles zero tokens', () => {
    const cost = estimateModelCost('claude-haiku-4-5-20251001', 0, 0)
    expect(cost).toBe(0)
  })

  it('handles only input tokens', () => {
    const cost = estimateModelCost('claude-haiku-4-5-20251001', 1000, undefined)
    expect(cost).toBeCloseTo(0.0008, 6)
  })

  it('handles only output tokens', () => {
    const cost = estimateModelCost('claude-haiku-4-5-20251001', undefined, 1000)
    expect(cost).toBeCloseTo(0.004, 6)
  })
})

describe('MODEL_PRICING sync with resolveLanguageModel', () => {
  const providers = ['anthropic', 'openai'] as const
  const langs = ['en', 'he', 'es'] as const

  it('every model returned by resolveLanguageModel has a pricing entry', () => {
    const modelIds = new Set<string>()

    for (const provider of providers) {
      for (const lang of langs) {
        const model = resolveLanguageModel(provider, lang)
        modelIds.add(model.modelId)
      }
    }

    for (const modelId of modelIds) {
      expect(
        MODEL_PRICING[modelId],
        `Missing pricing for model: ${modelId}. Add it to MODEL_PRICING in usage-tracking.ts`
      ).toBeDefined()
    }
  })
})

describe('recordAiUsage', () => {
  it('inserts a usage record via db.insert (fire-and-forget)', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    }

    await recordAiUsage(mockDb as never, {
      featureType: 'item_suggestions',
      planId: '00000000-0000-0000-0000-000000000001',
      userId: 'aaaaaaaa-1111-2222-3333-444444444444',
      provider: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      lang: 'en',
      status: 'success',
      inputTokens: 2000,
      outputTokens: 800,
      totalTokens: 2800,
      durationMs: 5000,
      promptLength: 1500,
      resultCount: 30,
    })

    expect(mockDb.insert).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        featureType: 'item_suggestions',
        planId: '00000000-0000-0000-0000-000000000001',
        status: 'success',
        inputTokens: 2000,
        outputTokens: 800,
        durationMs: 5000,
        estimatedCost: expect.any(String),
      })
    )
  })

  it('persists promptText and rawResponseText when provided', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    }

    await recordAiUsage(mockDb as never, {
      featureType: 'item_suggestions',
      provider: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      status: 'success',
      durationMs: 3000,
      promptText: 'Pack items for beach trip...',
      rawResponseText: '[{"name":"Sunscreen"}]',
      finishReason: 'stop',
    })

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promptText: 'Pack items for beach trip...',
        rawResponseText: '[{"name":"Sunscreen"}]',
        finishReason: 'stop',
        errorType: null,
      })
    )
  })

  it('persists errorType and defaults new fields to null when absent', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    }

    await recordAiUsage(mockDb as never, {
      featureType: 'item_suggestions',
      provider: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      status: 'error',
      durationMs: 1000,
      promptText: 'Pack items...',
      errorType: 'AI_NoObjectGeneratedError',
      errorMessage: 'No object generated',
    })

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promptText: 'Pack items...',
        errorType: 'AI_NoObjectGeneratedError',
        rawResponseText: null,
        finishReason: null,
      })
    )
  })

  it('does not throw when db.insert fails', async () => {
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('DB down')),
      }),
    }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      recordAiUsage(mockDb as never, {
        featureType: 'item_suggestions',
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        status: 'error',
        durationMs: 1000,
        errorMessage: 'Test error',
      })
    ).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ai-usage-tracking] Failed to record AI usage:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('stores null estimatedCost for unknown model', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    }

    await recordAiUsage(mockDb as never, {
      featureType: 'item_suggestions',
      provider: 'custom',
      modelId: 'custom:unknown-model',
      status: 'success',
      durationMs: 3000,
      inputTokens: 1000,
      outputTokens: 500,
    })

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCost: null,
      })
    )
  })
})
