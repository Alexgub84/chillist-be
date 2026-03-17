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
}

describe('WhatsApp env validation guards', () => {
  it('rejects WHATSAPP_PROVIDER=fake in production', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      WHATSAPP_PROVIDER: 'fake',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain(
        'WHATSAPP_PROVIDER=fake is not allowed in production — set to green_api'
      )
    }
  })

  it('rejects green_api without GREEN_API_INSTANCE_ID', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      WHATSAPP_PROVIDER: 'green_api',
      GREEN_API_TOKEN: 'some-token',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain(
        'GREEN_API_INSTANCE_ID and GREEN_API_TOKEN are required when WHATSAPP_PROVIDER=green_api'
      )
    }
  })

  it('rejects green_api without GREEN_API_TOKEN', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      WHATSAPP_PROVIDER: 'green_api',
      GREEN_API_INSTANCE_ID: 'some-id',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain(
        'GREEN_API_INSTANCE_ID and GREEN_API_TOKEN are required when WHATSAPP_PROVIDER=green_api'
      )
    }
  })

  it('accepts green_api with all credentials in production', () => {
    const result = envSchema.safeParse({
      ...PROD_BASE,
      WHATSAPP_PROVIDER: 'green_api',
      GREEN_API_INSTANCE_ID: 'instance-123',
      GREEN_API_TOKEN: 'token-abc',
    })

    expect(result.success).toBe(true)
  })

  it('allows WHATSAPP_PROVIDER=fake in development', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'development',
      WHATSAPP_PROVIDER: 'fake',
    })

    expect(result.success).toBe(true)
  })

  it('allows WHATSAPP_PROVIDER=fake in test', () => {
    const result = envSchema.safeParse({
      ...BASE_ENV,
      NODE_ENV: 'test',
      WHATSAPP_PROVIDER: 'fake',
    })

    expect(result.success).toBe(true)
  })
})
