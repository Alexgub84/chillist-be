import type { IWhatsAppService, SendResult } from './types.js'

export interface GreenApiConfig {
  instanceId: string
  token: string
}

function phoneToChatId(phone: string): string {
  return phone.replace('+', '') + '@c.us'
}

export class GreenApiWhatsAppService implements IWhatsAppService {
  private readonly baseUrl: string
  private readonly token: string

  constructor(config: GreenApiConfig) {
    this.baseUrl = `https://api.green-api.com/waInstance${config.instanceId}`
    this.token = config.token
  }

  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const chatId = phoneToChatId(phone)
    const url = `${this.baseUrl}/sendMessage/${this.token}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      })

      if (!response.ok) {
        const body = await response.text()
        return {
          success: false,
          error: `Green API ${response.status}: ${body}`,
        }
      }

      const data = (await response.json()) as { idMessage?: string }
      return { success: true, messageId: data.idMessage ?? 'unknown' }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown fetch error'
      return { success: false, error: errorMessage }
    }
  }
}
