import { describe, it, expect, beforeEach } from 'vitest'
import { FakeWhatsAppService } from '../../../src/services/whatsapp/fake.service.js'

describe('FakeWhatsAppService', () => {
  let service: FakeWhatsAppService

  beforeEach(() => {
    service = new FakeWhatsAppService()
  })

  it('sendMessage returns success with messageId', async () => {
    const result = await service.sendMessage('+972501234567', 'Hello')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.messageId).toMatch(/^fake-/)
    }
  })

  it('sendMessage stores the message', async () => {
    await service.sendMessage('+972501234567', 'Hello')

    const messages = service.getSentMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      phone: '+972501234567',
      message: 'Hello',
    })
  })

  it('multiple sends accumulate correctly', async () => {
    await service.sendMessage('+972501234567', 'First')
    await service.sendMessage('+15551234567', 'Second')
    await service.sendMessage('+972509876543', 'Third')

    const messages = service.getSentMessages()
    expect(messages).toHaveLength(3)
    expect(messages[0].message).toBe('First')
    expect(messages[1].message).toBe('Second')
    expect(messages[2].message).toBe('Third')
  })

  it('getSentMessages returns a copy, not the internal array', async () => {
    await service.sendMessage('+972501234567', 'Hello')
    const messages = service.getSentMessages()
    messages.pop()

    expect(service.getSentMessages()).toHaveLength(1)
  })

  it('clear resets stored messages', async () => {
    await service.sendMessage('+972501234567', 'Hello')
    await service.sendMessage('+15551234567', 'World')
    expect(service.getSentMessages()).toHaveLength(2)

    service.clear()
    expect(service.getSentMessages()).toHaveLength(0)
  })

  it('returns unique messageIds for each send', async () => {
    const result1 = await service.sendMessage('+972501234567', 'A')
    const result2 = await service.sendMessage('+972501234567', 'B')

    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
    if (result1.success && result2.success) {
      expect(result1.messageId).not.toBe(result2.messageId)
    }
  })
})
