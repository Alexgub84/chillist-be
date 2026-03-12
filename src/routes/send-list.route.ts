import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { plans, items } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'

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
          'Sends a formatted item list for the specified plan to the given phone number via WhatsApp. Caller must be a participant of the plan.',
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
          .select({ title: plans.title })
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

        const planTitle = plan.title ?? 'Untitled Plan'
        let message = `📋 *${planTitle}*\n\n`

        if (planItems.length === 0) {
          message += '_No items yet_'
        } else {
          const grouped: Record<string, string[]> = {}
          for (const item of planItems) {
            const cat = item.category ?? 'Other'
            if (!grouped[cat]) grouped[cat] = []
            const qty =
              item.quantity > 1
                ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}`
                : ''
            grouped[cat].push(
              qty ? `• ${item.name} (${qty})` : `• ${item.name}`
            )
          }

          for (const [category, lines] of Object.entries(grouped)) {
            message += `*${category}*\n${lines.join('\n')}\n\n`
          }
        }

        const result = await fastify.whatsapp.sendMessage(phone, message.trim())

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
}
