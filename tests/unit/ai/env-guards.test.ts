import { describe, it, expect } from 'vitest'
import { envSchema } from '../../../src/env.js'

const BASE_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
}

const PROD_BASE = {
  ...BASE_ENV,
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  CHATBOT_SERVICE_KEY: 'some-service-key',
  SUPABASE_SERVICE_ROLE_KEY: 'some-service-role-key',
  WHATSAPP_PROVIDER: 'green_api',
  GREEN_API_INSTANCE_ID: 'instance-123',
  GREEN_API_TOKEN: 'token-abc',
}

describe('AI env validation guards', () => {
  it('rejects production without ANTHROPIC_API_KEY when AI_PROVIDER=anthropic', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      AI_PROVIDER: 'anthropic',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain(
        'ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic'
      )
    }
  })

  it('rejects production without OPENAI_API_KEY when AI_PROVIDER=openai', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      AI_PROVIDER: 'openai',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain(
        'OPENAI_API_KEY is required when AI_PROVIDER=openai'
      )
    }
  })

  it('accepts production with ANTHROPIC_API_KEY when AI_PROVIDER=anthropic', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
    })

    expect(result.success).toBe(true)
  })

  it('accepts production with OPENAI_API_KEY when AI_PROVIDER=openai', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test-key',
    })

    expect(result.success).toBe(true)
  })

  it('allows missing API keys in development', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'development',
      AI_PROVIDER: 'anthropic',
    })

    expect(result.success).toBe(true)
  })

  it('allows missing API keys in test', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'test',
      AI_PROVIDER: 'openai',
    })

    expect(result.success).toBe(true)
  })

  it('defaults AI_PROVIDER to anthropic', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'development',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.AI_PROVIDER).toBe('anthropic')
    }
  })
})
