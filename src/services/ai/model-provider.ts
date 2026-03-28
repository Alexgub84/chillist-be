import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import type { SupportedAiLang } from './item-suggestions/prompt-templates.js'

const registry = createProviderRegistry({ anthropic, openai })

export function resolveLanguageModel(
  aiProvider: string,
  lang: SupportedAiLang = 'en'
): LanguageModelV2 {
  if (aiProvider === 'openai') {
    return lang === 'en'
      ? registry.languageModel('openai:gpt-4o-mini')
      : registry.languageModel('openai:gpt-4o')
  }
  return lang === 'en'
    ? registry.languageModel('anthropic:claude-haiku-4-5-20251001')
    : registry.languageModel('anthropic:claude-sonnet-4-20250514')
}
