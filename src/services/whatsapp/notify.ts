import type { FastifyBaseLogger } from 'fastify'
import type { IWhatsAppService } from './types.js'
import type { Database } from '../../db/index.js'
import { whatsappNotifications } from '../../db/schema.js'

type NotificationType =
  | 'invitation_sent'
  | 'join_request_pending'
  | 'join_request_approved'
  | 'join_request_rejected'

export interface FireAndForgetNotificationOpts {
  whatsapp: IWhatsAppService
  db: Database
  log: FastifyBaseLogger
  phone: string
  message: string
  planId: string
  recipientParticipantId: string | null
  type: NotificationType
  onSuccess?: () => void
}

export function fireAndForgetNotification(
  opts: FireAndForgetNotificationOpts
): void {
  const {
    whatsapp,
    db,
    log,
    phone,
    message,
    planId,
    recipientParticipantId,
    type,
    onSuccess,
  } = opts

  whatsapp
    .sendMessage(phone, message)
    .then((result) => {
      db.insert(whatsappNotifications)
        .values({
          planId,
          recipientPhone: phone,
          recipientParticipantId,
          type,
          status: result.success ? 'sent' : 'failed',
          messageId: result.success ? result.messageId : null,
          error: result.success ? null : result.error,
        })
        .catch((dbErr) =>
          log.warn({ err: dbErr }, 'Failed to persist WhatsApp notification')
        )

      if (result.success) {
        log.info(
          { planId, type, recipientParticipantId },
          'WhatsApp notification sent'
        )
        onSuccess?.()
      } else {
        log.warn(
          { planId, type, error: result.error },
          'WhatsApp notification failed'
        )
      }
    })
    .catch((err) => {
      log.warn({ err, planId, type }, 'WhatsApp notification error')
    })
}
