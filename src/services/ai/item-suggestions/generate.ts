import { generateObject, NoObjectGeneratedError } from 'ai'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import { itemSuggestionSchema, type ItemSuggestion } from './output-schema.js'
import { buildItemSuggestionsPrompt } from './build-prompt.js'
import type { PlanForAiContext } from '../plan-context-formatters.js'

export interface ItemSuggestionsResult {
  suggestions: ItemSuggestion[]
  prompt: string
  usage: {
    inputTokens: number | undefined
    outputTokens: number | undefined
    totalTokens: number | undefined
  }
}

function salvageFromRawText(text: string): ItemSuggestion[] {
  try {
    const parsed = JSON.parse(text)
    const elements: unknown[] = Array.isArray(parsed)
      ? parsed
      : (parsed?.elements ?? [])
    return elements
      .map((el) => itemSuggestionSchema.safeParse(el))
      .filter((r) => r.success)
      .map((r) => r.data!)
  } catch {
    return []
  }
}

export async function generateItemSuggestions(
  model: LanguageModelV2,
  plan: PlanForAiContext
): Promise<ItemSuggestionsResult> {
  const prompt = buildItemSuggestionsPrompt(plan)

  try {
    const { object: suggestions, usage } = await generateObject({
      model,
      output: 'array',
      schema: itemSuggestionSchema,
      prompt,
    })

    return {
      suggestions,
      prompt,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
    }
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      const salvaged = salvageFromRawText(error.text)
      if (salvaged.length > 0) {
        return {
          suggestions: salvaged,
          prompt,
          usage: {
            inputTokens: error.usage?.inputTokens,
            outputTokens: error.usage?.outputTokens,
            totalTokens: error.usage?.totalTokens,
          },
        }
      }
    }
    throw error
  }
}
