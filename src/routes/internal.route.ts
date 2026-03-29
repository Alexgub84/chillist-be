import { FastifyInstance } from 'fastify'
import { eq, inArray, count } from 'drizzle-orm'
import { resolveUserByPhone } from '../services/internal-auth.service.js'
import { normalizePhone } from '../utils/phone.js'
import { plans, participants, items } from '../db/schema.js'
import type { ItemStatus } from '../db/schema.js'

const INTERNAL_RATE_LIMIT = { max: 30, timeWindow: '1 minute' }

const COMPLETED_STATUSES: ItemStatus[] = ['packed', 'purchased']

function isItemCompleted(
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>
): boolean {
  return (
    assignmentStatusList.length > 0 &&
    assignmentStatusList.every((a) => COMPLETED_STATUSES.includes(a.status))
  )
}

export async function internalRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/auth/identify',
    {
      config: { rateLimit: INTERNAL_RATE_LIMIT },
      schema: {
        tags: ['internal'],
        summary: 'Resolve a WhatsApp phone number to a Chillist user',
        description:
          'Identifies a registered user by their phone number. Returns the Supabase userId and display name. Returns 404 if the phone is not linked to any registered Chillist account.',
        body: { $ref: 'IdentifyRequest#' },
        response: {
          200: {
            description:
              'Supabase user id and display name for the phone number',
            $ref: 'IdentifyResponse#',
          },
          401: {
            description: 'Missing or invalid x-service-key',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'No registered user linked to this phone number',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { phoneNumber } = request.body as { phoneNumber: string }
      const phonePrefix = normalizePhone(phoneNumber).slice(0, 4) + '***'

      request.log.info({ phonePrefix }, 'Identifying user by phone')

      const user = await resolveUserByPhone(
        fastify.db,
        phoneNumber,
        request.log
      )

      if (!user) {
        request.log.info({ phonePrefix }, 'User not found')
        return reply.code(404).send({ message: 'User not found' })
      }

      request.log.info({ phonePrefix }, 'User identified')
      return user
    }
  )

  fastify.get(
    '/plans',
    {
      schema: {
        tags: ['internal'],
        summary: 'List plans for the resolved chatbot user',
        description:
          'Returns a chatbot-friendly summary of all plans the user is a member of (owner, participant, or viewer). Requires x-service-key and x-user-id headers. completedItemCount counts items where every assignment entry has status packed or purchased.',
        response: {
          200: {
            description: 'Plans the user belongs to with counts and roles',
            $ref: 'InternalPlansResponse#',
          },
          401: {
            description:
              'Missing x-user-id, invalid x-service-key, or user could not be resolved',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Unexpected error while loading plans',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const userPlans = await fastify.db
        .select({
          planId: plans.planId,
          title: plans.title,
          startDate: plans.startDate,
          role: participants.role,
        })
        .from(plans)
        .innerJoin(participants, eq(participants.planId, plans.planId))
        .where(eq(participants.userId, userId))
        .orderBy(plans.createdAt)

      if (userPlans.length === 0) {
        return { plans: [] }
      }

      const planIds = userPlans.map((p) => p.planId)

      const [participantCounts, planItems] = await Promise.all([
        fastify.db
          .select({ planId: participants.planId, total: count() })
          .from(participants)
          .where(inArray(participants.planId, planIds))
          .groupBy(participants.planId),
        fastify.db
          .select({
            planId: items.planId,
            assignmentStatusList: items.assignmentStatusList,
          })
          .from(items)
          .where(inArray(items.planId, planIds)),
      ])

      const participantCountByPlan = new Map(
        participantCounts.map((r) => [r.planId, r.total])
      )

      const itemsByPlan = new Map<
        string,
        Array<{ participantId: string; status: ItemStatus }>[]
      >()
      for (const item of planItems) {
        const existing = itemsByPlan.get(item.planId) ?? []
        existing.push(item.assignmentStatusList)
        itemsByPlan.set(item.planId, existing)
      }

      const result = userPlans.map((p) => {
        const planItemList = itemsByPlan.get(p.planId) ?? []
        return {
          id: p.planId,
          name: p.title,
          date: p.startDate ? p.startDate.toISOString() : null,
          role: p.role,
          participantCount: participantCountByPlan.get(p.planId) ?? 0,
          itemCount: planItemList.length,
          completedItemCount: planItemList.filter(isItemCompleted).length,
        }
      })

      request.log.info(
        { count: result.length, userId },
        'Internal plans retrieved'
      )
      return { plans: result }
    }
  )
}
