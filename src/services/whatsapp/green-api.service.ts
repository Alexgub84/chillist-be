import type { IGreenApiClient, IWhatsAppService, SendResult } from './types.js'

export interface GreenApiConfig {
  instanceId: string
  token: string
}

export function phoneToChatId(phone: string): string {
  return phone.replace('+', '') + '@c.us'
}

export class HttpGreenApiClient implements IGreenApiClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(config: GreenApiConfig) {
    this.baseUrl = `https://api.green-api.com/waInstance${config.instanceId}`
    this.token = config.token
  }

  async sendMessage(chatId: string, message: string): Promise<SendResult> {
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

export class GreenApiWhatsAppService implements IWhatsAppService {
  private readonly client: IGreenApiClient

  constructor(client: IGreenApiClient) {
    this.client = client
  }

  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const chatId = phoneToChatId(phone)
    return this.client.sendMessage(chatId, message)
  }
}
