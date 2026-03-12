export type SendResult =
  | { success: true; messageId: string }
  | { success: false; error: string }

export interface IWhatsAppService {
  sendMessage(phone: string, message: string): Promise<SendResult>
}
