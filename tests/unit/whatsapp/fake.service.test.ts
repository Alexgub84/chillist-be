import { describe, it, expect, beforeEach } from 'vitest'
import { FakeGreenApiClient } from '../../../src/services/whatsapp/fake.service.js'

describe('FakeGreenApiClient', () => {
  let client: FakeGreenApiClient

  beforeEach(() => {
    client = new FakeGreenApiClient()
  })

  it('sendMessage returns success with messageId', async () => {
    const result = await client.sendMessage('972501234567@c.us', 'Hello')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.messageId).toMatch(/^fake-/)
    }
  })

  it('sendMessage stores the message', async () => {
    await client.sendMessage('972501234567@c.us', 'Hello')

    const messages = client.getSentMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      chatId: '972501234567@c.us',
      message: 'Hello',
    })
  })

  it('multiple sends accumulate correctly', async () => {
    await client.sendMessage('972501234567@c.us', 'First')
    await client.sendMessage('15551234567@c.us', 'Second')
    await client.sendMessage('972509876543@c.us', 'Third')

    const messages = client.getSentMessages()
    expect(messages).toHaveLength(3)
    expect(messages[0].message).toBe('First')
    expect(messages[1].message).toBe('Second')
    expect(messages[2].message).toBe('Third')
  })

  it('getSentMessages returns a copy, not the internal array', async () => {
    await client.sendMessage('972501234567@c.us', 'Hello')
    const messages = client.getSentMessages()
    messages.pop()

    expect(client.getSentMessages()).toHaveLength(1)
  })

  it('clear resets stored messages', async () => {
    await client.sendMessage('972501234567@c.us', 'Hello')
    await client.sendMessage('15551234567@c.us', 'World')
    expect(client.getSentMessages()).toHaveLength(2)

    client.clear()
    expect(client.getSentMessages()).toHaveLength(0)
  })

  it('returns unique messageIds for each send', async () => {
    const result1 = await client.sendMessage('972501234567@c.us', 'A')
    const result2 = await client.sendMessage('972501234567@c.us', 'B')

    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
    if (result1.success && result2.success) {
      expect(result1.messageId).not.toBe(result2.messageId)
    }
  })
})
