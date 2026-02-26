import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import {
  items,
  plans,
  participants,
  Unit,
  ItemCategory,
  ItemStatus,
} from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'

interface CreateItemBody {
  name: string
  category: ItemCategory
  quantity: number
  status: ItemStatus
  unit?: Unit
  notes?: string | null
  assignedParticipantId?: string | null
}

interface UpdateItemBody {
  name?: string
  category?: ItemCategory
  quantity?: number
  unit?: Unit
  status?: ItemStatus
  notes?: string | null
  assignedParticipantId?: string | null
}

export async function itemsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return
    const hasJwt = request.headers.authorization?.startsWith('Bearer ')
    if (!hasJwt) {
      return reply.status(401).send({ message: 'Authentication required' })
    }
    if (!request.user) {
      return reply
        .status(401)
        .send({ message: 'JWT token present but verification failed' })
    }
  })

  fastify.post<{ Params: { planId: string }; Body: CreateItemBody }>(
    '/plans/:planId/items',
    {
      schema: {
        tags: ['items'],
        summary: 'Add an item to a plan',
        description:
          'Create a new item in the specified plan. Equipment items always use pcs as the unit. Food items require a unit.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'CreateItemBody#' },
        response: {
          201: { $ref: 'Item#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params
      const { category, unit, assignedParticipantId, ...rest } = request.body

      if (category === 'food' && !unit) {
        return reply.status(400).send({
          message: 'Unit is required for food items',
        })
      }

      const resolvedUnit = category === 'equipment' ? 'pcs' : unit!

      try {
        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        if (assignedParticipantId) {
          const [participant] = await fastify.db
            .select({
              participantId: participants.participantId,
              planId: participants.planId,
            })
            .from(participants)
            .where(eq(participants.participantId, assignedParticipantId))

          if (!participant) {
            return reply.status(400).send({
              message: 'Participant not found',
            })
          }

          if (participant.planId !== planId) {
            return reply.status(400).send({
              message: 'Participant does not belong to this plan',
            })
          }
        }

        const [createdItem] = await fastify.db
          .insert(items)
          .values({
            planId,
            category,
            unit: resolvedUnit,
            assignedParticipantId: assignedParticipantId ?? null,
            ...rest,
          })
          .returning()

        request.log.info(
          { itemId: createdItem.itemId, planId, assignedParticipantId },
          'Item created'
        )
        return reply.status(201).send(createdItem)
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to create item')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply.status(503).send({
            message: 'Database connection error',
          })
        }

        return reply.status(500).send({
          message: 'Failed to create item',
        })
      }
    }
  )

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/items',
    {
      schema: {
        tags: ['items'],
        summary: 'List all items for a plan',
        description: 'Retrieve all items belonging to a specific plan',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'ItemList#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const planItems = await fastify.db
          .select()
          .from(items)
          .where(eq(items.planId, planId))
          .orderBy(items.createdAt)

        request.log.info(
          { planId, count: planItems.length },
          'Plan items retrieved'
        )
        return planItems
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to retrieve plan items'
        )

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply.status(503).send({
            message: 'Database connection error',
          })
        }

        return reply.status(500).send({
          message: 'Failed to retrieve plan items',
        })
      }
    }
  )

  fastify.patch<{ Params: { itemId: string }; Body: UpdateItemBody }>(
    '/items/:itemId',
    {
      schema: {
        tags: ['items'],
        summary: 'Update an item',
        description: 'Update an existing item by its ID',
        params: { $ref: 'ItemIdParam#' },
        body: { $ref: 'UpdateItemBody#' },
        response: {
          200: { $ref: 'Item#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { itemId } = request.params
      const updates = request.body

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          message: 'No fields to update',
        })
      }

      try {
        const [existingItem] = await fastify.db
          .select({ itemId: items.itemId, planId: items.planId })
          .from(items)
          .where(eq(items.itemId, itemId))

        if (!existingItem) {
          return reply.status(404).send({
            message: 'Item not found',
          })
        }

        if (
          updates.assignedParticipantId !== undefined &&
          updates.assignedParticipantId !== null
        ) {
          const [participant] = await fastify.db
            .select({
              participantId: participants.participantId,
              planId: participants.planId,
            })
            .from(participants)
            .where(
              eq(participants.participantId, updates.assignedParticipantId)
            )

          if (!participant) {
            return reply.status(400).send({
              message: 'Participant not found',
            })
          }

          if (participant.planId !== existingItem.planId) {
            return reply.status(400).send({
              message: 'Participant does not belong to this plan',
            })
          }
        }

        const [updatedItem] = await fastify.db
          .update(items)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(items.itemId, itemId))
          .returning()

        request.log.info(
          { itemId, changes: Object.keys(updates) },
          'Item updated'
        )
        return updatedItem
      } catch (error) {
        request.log.error({ err: error, itemId }, 'Failed to update item')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply.status(503).send({
            message: 'Database connection error',
          })
        }

        return reply.status(500).send({
          message: 'Failed to update item',
        })
      }
    }
  )
}
