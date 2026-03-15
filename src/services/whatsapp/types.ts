export type SendResult =
  | { success: true; messageId: string }
  | { success: false; error: string }

export interface IGreenApiClient {
  sendMessage(chatId: string, message: string): Promise<SendResult>
}

export interface IWhatsAppService {
  sendMessage(phone: string, message: string): Promise<SendResult>
}
