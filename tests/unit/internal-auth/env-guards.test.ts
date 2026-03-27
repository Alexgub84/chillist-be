import { describe, it, expect } from 'vitest'
import { envSchema } from '../../../src/env.js'

const BASE_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
}

const PROD_BASE = {
  ...BASE_ENV,
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  WHATSAPP_PROVIDER: 'green_api',
  GREEN_API_INSTANCE_ID: 'instance-123',
  GREEN_API_TOKEN: 'token-abc',
  CHATBOT_SERVICE_KEY: 'some-service-key',
  ANTHROPIC_API_KEY: 'sk-ant-test-key',
}

describe('Internal auth env validation guards', () => {
  it('rejects missing CHATBOT_SERVICE_KEY in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { CHATBOT_SERVICE_KEY: _key, ...withoutKey } = PROD_BASE
    const result = envSchema.safeParse(withoutKey)

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain(
        'CHATBOT_SERVICE_KEY is required in production'
      )
    }
  })

  it('accepts all required keys present in production', () => {
    const result = envSchema.safeParse(PROD_BASE)
    expect(result.success).toBe(true)
  })

  it('allows missing CHATBOT_SERVICE_KEY in development', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'development',
    })
    expect(result.success).toBe(true)
  })

  it('allows missing SUPABASE_SERVICE_ROLE_KEY in test', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'test',
    })
    expect(result.success).toBe(true)
  })
})
