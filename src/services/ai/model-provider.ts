import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'
import type { LanguageModelV2 } from '@ai-sdk/provider'

const registry = createProviderRegistry({ anthropic, openai })

export function resolveLanguageModel(aiProvider: string): LanguageModelV2 {
  return aiProvider === 'openai'
    ? registry.languageModel('openai:gpt-4o-mini')
    : registry.languageModel('anthropic:claude-haiku-4-5-20251001')
}
