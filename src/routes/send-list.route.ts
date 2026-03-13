import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { plans, items, participants } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import {
  resolveLanguage,
  sendListMessage,
  translateCategory,
  translateUnit,
} from '../services/whatsapp/messages.js'

interface SendListBody {
  phone: string
}

export async function sendListRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return
    const hasJwt = request.headers.authorization?.startsWith('Bearer ')
    if (!hasJwt) {
      return reply.status(401).send({ message: 'Authentication required' })
    }
    if (!request.user) {
      return reply
        .status(401)
        .send({ message: 'Invalid or expired authentication token' })
    }
  })

  fastify.post<{
    Params: { planId: string }
    Body: SendListBody
  }>(
    '/plans/:planId/send-list',
    {
      schema: {
        tags: ['plans'],
        summary: 'Send the item list for a plan via WhatsApp',
        description:
          'Sends a formatted item list for the specified plan to the given phone number via WhatsApp. ' +
          'Items are grouped by category and include name, quantity, and unit. ' +
          'The message language (English or Hebrew) is determined by the plan defaultLang setting. ' +
          'The phone number must be in E.164 format. ' +
          'Requires JWT authentication. Caller must be a participant of the plan.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'SendListBody#' },
        response: {
          200: {
            description: 'Message sent successfully',
            $ref: 'SendListResponse#',
          },
          400: {
            description: 'Bad request',
            $ref: 'ErrorResponse#',
          },
          401: {
            description: 'Authentication required',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'Forbidden — not a participant of this plan',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Plan not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params
      const { phone } = request.body

      try {
        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed) {
          return reply
            .status(403)
            .send({ message: 'You are not a participant of this plan' })
        }

        const [plan] = await fastify.db
          .select({ title: plans.title, defaultLang: plans.defaultLang })
          .from(plans)
          .where(eq(plans.planId, planId))
          .limit(1)

        if (!plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const planItems = await fastify.db
          .select({
            name: items.name,
            quantity: items.quantity,
            unit: items.unit,
            category: items.category,
          })
          .from(items)
          .where(eq(items.planId, planId))

        const lang = resolveLanguage(plan.defaultLang)
        const planTitle =
          plan.title ?? (lang === 'he' ? 'תוכנית ללא שם' : 'Untitled Plan')

        let categoryBlocks = ''
        if (planItems.length > 0) {
          const grouped: Record<string, string[]> = {}
          for (const item of planItems) {
            const cat = translateCategory(item.category ?? 'other', lang)
            if (!grouped[cat]) grouped[cat] = []
            const qty =
              item.quantity > 1
                ? `${item.quantity} ${item.unit ? translateUnit(item.unit, lang) : ''}`
                : ''
            grouped[cat].push(
              qty ? `• ${item.name} (${qty.trim()})` : `• ${item.name}`
            )
          }

          for (const [category, lines] of Object.entries(grouped)) {
            categoryBlocks += `*${category}*\n${lines.join('\n')}\n\n`
          }
        }

        const message = sendListMessage(lang, {
          planTitle,
          categoryBlocks,
          emptyList: planItems.length === 0,
        })

        const result = await fastify.whatsapp.sendMessage(phone, message)

        if (result.success) {
          request.log.info(
            { planId, phone, messageId: result.messageId },
            'Item list sent via WhatsApp'
          )
          return reply.send({ sent: true, messageId: result.messageId })
        }

        request.log.warn(
          { planId, phone, error: result.error },
          'Failed to send item list via WhatsApp'
        )
        return reply.send({ sent: false, error: result.error })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to send item list')
        return reply.status(500).send({ message: 'Failed to send item list' })
      }
    }
  )

  fastify.post<{
    Params: { planId: string }
  }>(
    '/plans/:planId/send-list-all',
    {
      schema: {
        tags: ['plans'],
        summary:
          'Send the item list to all non-owner participants via WhatsApp',
        description:
          'Sends the formatted item list for the specified plan to every non-owner participant who has a phone number. ' +
          'Messages are sent in parallel. The response includes per-participant results. ' +
          'Language is determined by plan defaultLang. ' +
          'Requires JWT authentication. Caller must be the plan owner or admin.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'Bulk send results',
            $ref: 'SendListAllResponse#',
          },
          401: {
            description: 'Authentication required',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'Forbidden — not the plan owner',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Plan not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const [plan] = await fastify.db
          .select({
            title: plans.title,
            defaultLang: plans.defaultLang,
            ownerParticipantId: plans.ownerParticipantId,
            createdByUserId: plans.createdByUserId,
          })
          .from(plans)
          .where(eq(plans.planId, planId))
          .limit(1)

        if (!plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        if (plan.createdByUserId !== request.user!.id) {
          return reply
            .status(403)
            .send({ message: 'Only the plan owner can send to all' })
        }

        const recipients = await fastify.db
          .select({
            participantId: participants.participantId,
            contactPhone: participants.contactPhone,
          })
          .from(participants)
          .where(eq(participants.planId, planId))

        const nonOwnerRecipients = recipients.filter(
          (p) => p.participantId !== plan.ownerParticipantId && p.contactPhone
        )

        if (nonOwnerRecipients.length === 0) {
          return reply.send({
            total: 0,
            sent: 0,
            failed: 0,
            results: [],
          })
        }

        const planItems = await fastify.db
          .select({
            name: items.name,
            quantity: items.quantity,
            unit: items.unit,
            category: items.category,
          })
          .from(items)
          .where(eq(items.planId, planId))

        const lang = resolveLanguage(plan.defaultLang)
        const planTitle =
          plan.title ?? (lang === 'he' ? 'תוכנית ללא שם' : 'Untitled Plan')

        let categoryBlocks = ''
        if (planItems.length > 0) {
          const grouped: Record<string, string[]> = {}
          for (const item of planItems) {
            const cat = translateCategory(item.category ?? 'other', lang)
            if (!grouped[cat]) grouped[cat] = []
            const qty =
              item.quantity > 1
                ? `${item.quantity} ${item.unit ? translateUnit(item.unit, lang) : ''}`
                : ''
            grouped[cat].push(
              qty ? `• ${item.name} (${qty.trim()})` : `• ${item.name}`
            )
          }
          for (const [category, lines] of Object.entries(grouped)) {
            categoryBlocks += `*${category}*\n${lines.join('\n')}\n\n`
          }
        }

        const message = sendListMessage(lang, {
          planTitle,
          categoryBlocks,
          emptyList: planItems.length === 0,
        })

        const sendResults = await Promise.all(
          nonOwnerRecipients.map(async (recipient) => {
            try {
              const result = await fastify.whatsapp.sendMessage(
                recipient.contactPhone,
                message
              )
              if (result.success) {
                return {
                  participantId: recipient.participantId,
                  phone: recipient.contactPhone,
                  sent: true,
                  messageId: result.messageId,
                }
              }
              return {
                participantId: recipient.participantId,
                phone: recipient.contactPhone,
                sent: false,
                error: result.error,
              }
            } catch {
              return {
                participantId: recipient.participantId,
                phone: recipient.contactPhone,
                sent: false,
                error: 'Unexpected send error',
              }
            }
          })
        )

        const sentCount = sendResults.filter((r) => r.sent).length

        request.log.info(
          { planId, total: nonOwnerRecipients.length, sent: sentCount },
          'Bulk item list sent via WhatsApp'
        )

        return reply.send({
          total: nonOwnerRecipients.length,
          sent: sentCount,
          failed: nonOwnerRecipients.length - sentCount,
          results: sendResults,
        })
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to send item list to all'
        )
        return reply
          .status(500)
          .send({ message: 'Failed to send item list to all' })
      }
    }
  )
}
