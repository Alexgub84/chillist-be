import type { IGreenApiClient, SendResult } from './types.js'

export interface SentMessage {
  chatId: string
  message: string
}

export class FakeGreenApiClient implements IGreenApiClient {
  private sentMessages: SentMessage[] = []

  async sendMessage(chatId: string, message: string): Promise<SendResult> {
    const messageId = `fake-${Date.now()}-${this.sentMessages.length}`
    this.sentMessages.push({ chatId, message })
    return { success: true, messageId }
  }

  getSentMessages(): SentMessage[] {
    return [...this.sentMessages]
  }

  clear(): void {
    this.sentMessages = []
  }
}
