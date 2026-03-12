import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GreenApiWhatsAppService } from '../../../src/services/whatsapp/green-api.service.js'

const INSTANCE_ID = '1234567890'
const TOKEN = 'test-token-abc123'

describe('GreenApiWhatsAppService', () => {
  let service: GreenApiWhatsAppService
  const originalFetch = globalThis.fetch
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    service = new GreenApiWhatsAppService({
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

    await service.sendMessage('+972501234567', 'Hello')

    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${TOKEN}`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('converts E.164 phone to chatId format', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ idMessage: 'msg-1' }), { status: 200 })
    )

    await service.sendMessage('+972501234567', 'Hello')

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

    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result).toEqual({ success: true, messageId: 'abc-123-def' })
  })

  it('returns success with "unknown" when idMessage is missing', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    )

    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result).toEqual({ success: true, messageId: 'unknown' })
  })

  it('returns failure on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 })
    )

    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Green API 400')
      expect(result.error).toContain('Bad Request')
    }
  })

  it('returns failure on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result).toEqual({ success: false, error: 'fetch failed' })
  })

  it('returns failure with generic message on non-Error throw', async () => {
    mockFetch.mockRejectedValueOnce('string error')

    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result).toEqual({ success: false, error: 'Unknown fetch error' })
  })
})
