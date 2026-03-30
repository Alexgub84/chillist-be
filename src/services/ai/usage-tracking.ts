import type { Database } from '../../db/index.js'
import { aiUsageLogs, type AiFeatureType } from '../../db/schema.js'

export interface AiUsageRecord {
  featureType: AiFeatureType
  planId?: string | null
  userId?: string | null
  provider: string
  modelId: string
  lang?: string | null
  status: 'success' | 'partial' | 'error'
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  durationMs: number
  promptLength?: number
  promptText?: string
  resultCount?: number
  errorMessage?: string
  errorType?: string
  finishReason?: string
  rawResponseText?: string | null
  metadata?: Record<string, unknown>
}

const MODEL_PRICING: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  'claude-haiku-4-5-20251001': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-sonnet-4-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
}

export { MODEL_PRICING }

export function estimateModelCost(
  modelId: string,
  inputTokens?: number,
  outputTokens?: number
): number | null {
  const pricing = MODEL_PRICING[modelId]
  if (!pricing) return null
  if (inputTokens == null && outputTokens == null) return null

  const inputCost = ((inputTokens ?? 0) / 1_000_000) * pricing.inputPer1M
  const outputCost = ((outputTokens ?? 0) / 1_000_000) * pricing.outputPer1M
  return inputCost + outputCost
}

export async function recordAiUsage(
  db: Database,
  record: AiUsageRecord
): Promise<void> {
  try {
    const cost = estimateModelCost(
      record.modelId,
      record.inputTokens,
      record.outputTokens
    )

    await db.insert(aiUsageLogs).values({
      featureType: record.featureType,
      planId: record.planId ?? null,
      userId: record.userId ?? null,
      provider: record.provider,
      modelId: record.modelId,
      lang: record.lang ?? null,
      status: record.status,
      inputTokens: record.inputTokens ?? null,
      outputTokens: record.outputTokens ?? null,
      totalTokens: record.totalTokens ?? null,
      estimatedCost: cost?.toFixed(6) ?? null,
      durationMs: record.durationMs,
      promptLength: record.promptLength ?? null,
      promptText: record.promptText ?? null,
      resultCount: record.resultCount ?? null,
      errorMessage: record.errorMessage ?? null,
      errorType: record.errorType ?? null,
      finishReason: record.finishReason ?? null,
      rawResponseText: record.rawResponseText ?? null,
      metadata: record.metadata ?? null,
    })
  } catch (err) {
    console.error('[ai-usage-tracking] Failed to record AI usage:', err)
  }
}
