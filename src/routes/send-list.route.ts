import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { items, participants } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import {
  resolveLanguage,
  resolvePlanTitle,
  formatItemList,
  sendListMessage,
} from '../services/whatsapp/messages.js'
import {
  filterItemsForList,
  type ListType,
  type ItemWithAssignments,
} from '../services/whatsapp/item-filters.js'

interface SendListBody {
  recipient: string
  listType?: ListType
}

interface Recipient {
  participantId: string
  phone: string
}

async function sendToRecipient(
  fastify: FastifyInstance,
  recipient: Recipient,
  planItems: ItemWithAssignments[],
  listType: ListType,
  lang: 'en' | 'he',
  planTitle: string
) {
  try {
    const filtered = filterItemsForList(
      planItems,
      listType,
      recipient.participantId
    )
    if (filtered.length === 0) {
      return {
        participantId: recipient.participantId,
        phone: recipient.phone,
        sent: false as const,
        error: 'empty_list',
      }
    }
    const categoryBlocks = formatItemList(filtered, lang)
    const message = sendListMessage(lang, {
      planTitle,
      categoryBlocks,
      emptyList: false,
      listType,
    })
    const result = await fastify.whatsapp.sendMessage(recipient.phone, message)
    if (result.success) {
      return {
        participantId: recipient.participantId,
        phone: recipient.phone,
        sent: true as const,
        messageId: result.messageId,
      }
    }
    return {
      participantId: recipient.participantId,
      phone: recipient.phone,
      sent: false as const,
      error: result.error,
    }
  } catch {
    return {
      participantId: recipient.participantId,
      phone: recipient.phone,
      sent: false as const,
      error: 'Unexpected send error',
    }
  }
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
          'Sends a formatted item list for the specified plan via WhatsApp. ' +
          'Use "recipient" to control who receives the list: ' +
          '"self" sends to the caller, "all" sends to every non-owner participant (owner-only), ' +
          'or pass a specific participantId. ' +
          'Use "listType" to filter items: "full" (default), "buying", "packing", or "unassigned". ' +
          'When recipient is "all" with buying/packing, items are filtered per-participant. ' +
          'Requires JWT authentication.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'SendListBody#' },
        response: {
          200: {
            description: 'Send results',
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
            description: 'Forbidden',
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
      const { recipient, listType = 'full' } = request.body

      try {
        const { allowed, plan: accessPlan } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed || !accessPlan) {
          if (!accessPlan) {
            return reply.status(404).send({ message: 'Plan not found' })
          }
          return reply
            .status(403)
            .send({ message: 'You are not a participant of this plan' })
        }

        const lang = resolveLanguage(accessPlan.defaultLang)
        const planTitle = resolvePlanTitle(accessPlan.title, lang)

        const planItems = await fastify.db
          .select({
            name: items.name,
            quantity: items.quantity,
            unit: items.unit,
            category: items.category,
            isAllParticipants: items.isAllParticipants,
            assignmentStatusList: items.assignmentStatusList,
          })
          .from(items)
          .where(eq(items.planId, planId))

        const allParticipants = await fastify.db
          .select({
            participantId: participants.participantId,
            contactPhone: participants.contactPhone,
            userId: participants.userId,
          })
          .from(participants)
          .where(eq(participants.planId, planId))

        let targets: Recipient[]

        if (recipient === 'self') {
          const callerParticipant = allParticipants.find(
            (p) => p.userId === request.user!.id
          )
          if (!callerParticipant) {
            return reply
              .status(403)
              .send({ message: 'You are not a participant of this plan' })
          }
          if (!callerParticipant.contactPhone) {
            return reply
              .status(400)
              .send({ message: 'You do not have a phone number on file' })
          }
          targets = [
            {
              participantId: callerParticipant.participantId,
              phone: callerParticipant.contactPhone,
            },
          ]
        } else if (recipient === 'all') {
          if (accessPlan.createdByUserId !== request.user!.id) {
            return reply
              .status(403)
              .send({ message: 'Only the plan owner can send to all' })
          }
          targets = allParticipants
            .filter(
              (p) =>
                p.participantId !== accessPlan.ownerParticipantId &&
                p.contactPhone
            )
            .map((p) => ({
              participantId: p.participantId,
              phone: p.contactPhone!,
            }))
        } else {
          const targetParticipant = allParticipants.find(
            (p) => p.participantId === recipient
          )
          if (!targetParticipant) {
            return reply.status(404).send({ message: 'Participant not found' })
          }
          if (!targetParticipant.contactPhone) {
            return reply
              .status(400)
              .send({ message: 'Participant does not have a phone number' })
          }
          targets = [
            {
              participantId: targetParticipant.participantId,
              phone: targetParticipant.contactPhone,
            },
          ]
        }

        if (targets.length === 0) {
          return reply.send({ total: 0, sent: 0, failed: 0, results: [] })
        }

        const perParticipantFiltering =
          recipient === 'all' &&
          (listType === 'buying' || listType === 'packing')

        if (recipient !== 'all' && !perParticipantFiltering) {
          const filtered = filterItemsForList(planItems, listType)
          if (filtered.length === 0) {
            return reply.status(400).send({
              message: 'No items match the selected list type',
              code: 'EMPTY_LIST',
            })
          }
        }

        const sendResults = await Promise.all(
          targets.map((target) => {
            if (perParticipantFiltering) {
              return sendToRecipient(
                fastify,
                target,
                planItems,
                listType,
                lang,
                planTitle
              )
            }
            const filtered = filterItemsForList(planItems, listType)
            if (filtered.length === 0) {
              return {
                participantId: target.participantId,
                phone: target.phone,
                sent: false as const,
                error: 'empty_list',
              }
            }
            const categoryBlocks = formatItemList(filtered, lang)
            const message = sendListMessage(lang, {
              planTitle,
              categoryBlocks,
              emptyList: false,
              listType,
            })
            return fastify.whatsapp
              .sendMessage(target.phone, message)
              .then((result) => {
                if (result.success) {
                  return {
                    participantId: target.participantId,
                    phone: target.phone,
                    sent: true as const,
                    messageId: result.messageId,
                  }
                }
                return {
                  participantId: target.participantId,
                  phone: target.phone,
                  sent: false as const,
                  error: result.error,
                }
              })
              .catch(() => ({
                participantId: target.participantId,
                phone: target.phone,
                sent: false as const,
                error: 'Unexpected send error',
              }))
          })
        )

        const sentCount = sendResults.filter((r) => r.sent).length

        request.log.info(
          {
            planId,
            total: targets.length,
            sent: sentCount,
            listType,
            recipient,
          },
          'Item list sent via WhatsApp'
        )

        return reply.send({
          total: targets.length,
          sent: sentCount,
          failed: targets.length - sentCount,
          results: sendResults,
        })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to send item list')
        return reply.status(500).send({ message: 'Failed to send item list' })
      }
    }
  )
}
