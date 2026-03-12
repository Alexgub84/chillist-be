import type { IWhatsAppService, SendResult } from './types.js'

export interface SentMessage {
  phone: string
  message: string
}

export class FakeWhatsAppService implements IWhatsAppService {
  private sentMessages: SentMessage[] = []

  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const messageId = `fake-${Date.now()}-${this.sentMessages.length}`
    this.sentMessages.push({ phone, message })
    return { success: true, messageId }
  }

  getSentMessages(): SentMessage[] {
    return [...this.sentMessages]
  }

  clear(): void {
    this.sentMessages = []
  }
}
