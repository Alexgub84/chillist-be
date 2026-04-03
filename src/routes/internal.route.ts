import { FastifyInstance } from 'fastify'
import { and, eq, inArray, count } from 'drizzle-orm'
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

function participantLabel(p: {
  displayName: string | null
  name: string
  lastName: string
}): string {
  const d = p.displayName?.trim()
  if (d) return d
  return `${p.name} ${p.lastName}`.trim()
}

function itemCategoryToInternal(
  cat: 'group_equipment' | 'personal_equipment' | 'food'
): 'gear' | 'food' {
  return cat === 'food' ? 'food' : 'gear'
}

function userItemStatus(
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>,
  userParticipantId: string
): 'done' | 'pending' {
  const mine = assignmentStatusList.find(
    (a) => a.participantId === userParticipantId
  )
  if (!mine) return 'pending'
  if (mine.status === 'packed' || mine.status === 'purchased') return 'done'
  return 'pending'
}

function upsertAssignment(
  list: Array<{ participantId: string; status: ItemStatus }>,
  participantId: string,
  status: ItemStatus
): Array<{ participantId: string; status: ItemStatus }> {
  const next = [...list]
  const idx = next.findIndex((a) => a.participantId === participantId)
  if (idx >= 0) next[idx] = { participantId, status }
  else next.push({ participantId, status })
  return next
}

function assigneeLabel(
  isAllParticipants: boolean,
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>,
  participantById: Map<
    string,
    { displayName: string | null; name: string; lastName: string }
  >
): string | null {
  if (isAllParticipants) return null
  if (assignmentStatusList.length === 0) return null
  const labels: string[] = []
  const seen = new Set<string>()
  for (const a of assignmentStatusList) {
    const row = participantById.get(a.participantId)
    if (!row) continue
    const label = participantLabel(row)
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels.length === 0 ? null : labels.join(', ')
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

  fastify.get(
    '/plans/:planId',
    {
      schema: {
        tags: ['internal'],
        summary: 'Plan details for chatbot',
        description:
          'Returns plan metadata, participants, and items. Requires x-service-key and x-user-id. Items reflect the calling user’s assignment row.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'InternalPlanDetailResponse#' },
          401: { $ref: 'ErrorResponse#' },
          403: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }
      const { planId } = request.params as { planId: string }

      const [planRow] = await fastify.db
        .select()
        .from(plans)
        .where(eq(plans.planId, planId))

      if (!planRow) {
        return reply.code(404).send({ message: 'Plan not found' })
      }

      const [userParticipant] = await fastify.db
        .select()
        .from(participants)
        .where(
          and(eq(participants.planId, planId), eq(participants.userId, userId))
        )
        .limit(1)

      if (!userParticipant) {
        return reply.code(403).send({ message: 'Access denied' })
      }

      const planParticipants = await fastify.db
        .select()
        .from(participants)
        .where(eq(participants.planId, planId))

      const participantById = new Map(
        planParticipants.map((p) => [p.participantId, p])
      )

      const planItems = await fastify.db
        .select()
        .from(items)
        .where(eq(items.planId, planId))

      const participantPayload = planParticipants.map((p) => ({
        id: p.participantId,
        name: participantLabel(p),
        role: p.role,
      }))

      const itemsPayload = planItems.map((it) => ({
        id: it.itemId,
        name: it.name,
        status: userItemStatus(
          it.assignmentStatusList,
          userParticipant.participantId
        ),
        assignee: assigneeLabel(
          it.isAllParticipants,
          it.assignmentStatusList,
          participantById
        ),
        category: itemCategoryToInternal(it.category),
      }))

      request.log.info({ planId, userId }, 'Internal plan detail retrieved')

      return {
        plan: {
          id: planRow.planId,
          name: planRow.title,
          date: planRow.startDate ? planRow.startDate.toISOString() : null,
          role: userParticipant.role,
          participants: participantPayload,
          items: itemsPayload,
        },
      }
    }
  )

  fastify.patch(
    '/items/:itemId/status',
    {
      schema: {
        tags: ['internal'],
        summary: 'Update item assignment status for chatbot user',
        description:
          'Upserts the calling user’s assignmentStatusList entry. done maps to purchased.',
        params: { $ref: 'ItemIdParam#' },
        body: { $ref: 'InternalUpdateItemStatusBody#' },
        response: {
          200: { $ref: 'InternalUpdateItemStatusResponse#' },
          401: { $ref: 'ErrorResponse#' },
          403: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }
      const { itemId } = request.params as { itemId: string }
      const { status } = request.body as { status: 'done' | 'pending' }

      const [itemRow] = await fastify.db
        .select()
        .from(items)
        .where(eq(items.itemId, itemId))

      if (!itemRow) {
        return reply.code(404).send({ message: 'Item not found' })
      }

      const [userParticipant] = await fastify.db
        .select()
        .from(participants)
        .where(
          and(
            eq(participants.planId, itemRow.planId),
            eq(participants.userId, userId)
          )
        )
        .limit(1)

      if (!userParticipant) {
        return reply.code(403).send({ message: 'Access denied' })
      }

      const nextStatus: ItemStatus = status === 'done' ? 'purchased' : 'pending'

      const newList = upsertAssignment(
        itemRow.assignmentStatusList,
        userParticipant.participantId,
        nextStatus
      )

      await fastify.db
        .update(items)
        .set({
          assignmentStatusList: newList,
          updatedAt: new Date(),
        })
        .where(eq(items.itemId, itemId))

      const viewStatus = userItemStatus(newList, userParticipant.participantId)

      request.log.info({ itemId, userId }, 'Internal item status updated')

      return {
        item: {
          id: itemRow.itemId,
          name: itemRow.name,
          status: viewStatus,
        },
      }
    }
  )
}
