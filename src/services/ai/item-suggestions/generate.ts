import { generateObject, NoObjectGeneratedError } from 'ai'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import { itemSuggestionSchema, type ItemSuggestion } from './output-schema.js'
import { buildItemSuggestionsPrompt } from './build-prompt.js'
import type { PlanForAiContext } from '../plan-context-formatters.js'
import type { SupportedAiLang } from './prompt-templates.js'

interface TokenUsage {
  inputTokens: number | undefined
  outputTokens: number | undefined
  totalTokens: number | undefined
}

interface ItemSuggestionsBase {
  prompt: string
  usage: TokenUsage
  finishReason?: string
}

export interface ItemSuggestionsSuccess extends ItemSuggestionsBase {
  status: 'success'
  suggestions: ItemSuggestion[]
  rawResponseText: string
}

export interface ItemSuggestionsPartial extends ItemSuggestionsBase {
  status: 'partial'
  suggestions: ItemSuggestion[]
  rawResponseText: string
}

export interface ItemSuggestionsError extends ItemSuggestionsBase {
  status: 'error'
  suggestions: []
  rawResponseText: string | null
  errorType: string
  errorMessage: string
}

export type ItemSuggestionsResult =
  | ItemSuggestionsSuccess
  | ItemSuggestionsPartial
  | ItemSuggestionsError

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
  plan: PlanForAiContext,
  lang: SupportedAiLang = 'en'
): Promise<ItemSuggestionsResult> {
  const prompt = buildItemSuggestionsPrompt(plan, lang)

  try {
    const {
      object: suggestions,
      usage,
      finishReason,
    } = await generateObject({
      model,
      output: 'array',
      schema: itemSuggestionSchema,
      prompt,
    })

    return {
      status: 'success',
      suggestions,
      prompt,
      rawResponseText: JSON.stringify(suggestions),
      finishReason,
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
          status: 'partial',
          suggestions: salvaged,
          prompt,
          rawResponseText: error.text,
          usage: {
            inputTokens: error.usage?.inputTokens,
            outputTokens: error.usage?.outputTokens,
            totalTokens: error.usage?.totalTokens,
          },
        }
      }
    }

    const err = error instanceof Error ? error : new Error(String(error))
    return {
      status: 'error',
      suggestions: [],
      prompt,
      rawResponseText: NoObjectGeneratedError.isInstance(error)
        ? (error.text ?? null)
        : null,
      errorType: err.name,
      errorMessage: err.message,
      usage: NoObjectGeneratedError.isInstance(error)
        ? {
            inputTokens: error.usage?.inputTokens,
            outputTokens: error.usage?.outputTokens,
            totalTokens: error.usage?.totalTokens,
          }
        : {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          },
    }
  }
}
