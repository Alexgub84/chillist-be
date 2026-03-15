import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  GreenApiWhatsAppService,
  HttpGreenApiClient,
  phoneToChatId,
} from '../../../src/services/whatsapp/green-api.service.js'
import { FakeGreenApiClient } from '../../../src/services/whatsapp/fake.service.js'

const INSTANCE_ID = '1234567890'
const TOKEN = 'test-token-abc123'

describe('HttpGreenApiClient', () => {
  let client: HttpGreenApiClient
  const originalFetch = globalThis.fetch
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    client = new HttpGreenApiClient({
      instanceId: INSTANCE_ID,
      token: TOKEN,
    })
    globalThis.fetch = mockFetch
    mockFetch.mockReset()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('constructs correct URL from instanceId and token', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ idMessage: 'msg-1' }), { status: 200 })
    )

    await client.sendMessage('972501234567@c.us', 'Hello')

    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${TOKEN}`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends chatId and message in request body', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ idMessage: 'msg-1' }), { status: 200 })
    )

    await client.sendMessage('972501234567@c.us', 'Hello')

    const callArgs = mockFetch.mock.calls[0]
    const init = callArgs[1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.chatId).toBe('972501234567@c.us')
    expect(body.message).toBe('Hello')
  })

  it('returns success with messageId on 200', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ idMessage: 'abc-123-def' }), {
        status: 200,
      })
    )

    const result = await client.sendMessage('972501234567@c.us', 'Hello')

    expect(result).toEqual({ success: true, messageId: 'abc-123-def' })
  })

  it('returns success with "unknown" when idMessage is missing', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    )

    const result = await client.sendMessage('972501234567@c.us', 'Hello')

    expect(result).toEqual({ success: true, messageId: 'unknown' })
  })

  it('returns failure on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 })
    )

    const result = await client.sendMessage('972501234567@c.us', 'Hello')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Green API 400')
      expect(result.error).toContain('Bad Request')
    }
  })

  it('returns failure on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await client.sendMessage('972501234567@c.us', 'Hello')

    expect(result).toEqual({ success: false, error: 'fetch failed' })
  })

  it('returns failure with generic message on non-Error throw', async () => {
    mockFetch.mockRejectedValueOnce('string error')

    const result = await client.sendMessage('972501234567@c.us', 'Hello')

    expect(result).toEqual({ success: false, error: 'Unknown fetch error' })
  })
})

describe('GreenApiWhatsAppService', () => {
  let fakeClient: FakeGreenApiClient
  let service: GreenApiWhatsAppService

  beforeEach(() => {
    fakeClient = new FakeGreenApiClient()
    service = new GreenApiWhatsAppService(fakeClient)
  })

  it('converts E.164 phone to chatId via phoneToChatId', async () => {
    await service.sendMessage('+972501234567', 'Hello')

    const messages = fakeClient.getSentMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].chatId).toBe('972501234567@c.us')
    expect(messages[0].message).toBe('Hello')
  })

  it('delegates to the underlying client and returns its result', async () => {
    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.messageId).toMatch(/^fake-/)
    }
  })
})

describe('phoneToChatId', () => {
  it('strips + and appends @c.us', () => {
    expect(phoneToChatId('+972501234567')).toBe('972501234567@c.us')
  })

  it('handles phone without + prefix', () => {
    expect(phoneToChatId('972501234567')).toBe('972501234567@c.us')
  })
})
