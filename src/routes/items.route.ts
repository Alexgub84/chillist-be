import { FastifyInstance } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
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
  subcategory?: string | null
  notes?: string | null
  assignedParticipantId?: string | null
}

interface UpdateItemBody {
  name?: string
  category?: ItemCategory
  quantity?: number
  unit?: Unit
  status?: ItemStatus
  subcategory?: string | null
  notes?: string | null
  assignedParticipantId?: string | null
}

interface BulkItemError {
  name: string
  message: string
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

  fastify.post<{
    Params: { planId: string }
    Body: { items: CreateItemBody[] }
  }>(
    '/plans/:planId/items/bulk',
    {
      schema: {
        tags: ['items'],
        summary: 'Bulk create items in a plan',
        description:
          'Create multiple items at once. Each item is validated independently — valid items are created, invalid items are reported in the errors array with their name.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'BulkCreateItemBody#' },
        response: {
          200: { $ref: 'BulkItemResponse#' },
          207: { $ref: 'BulkItemResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params
      const { items: itemsToCreate } = request.body

      try {
        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const participantIds = [
          ...new Set(
            itemsToCreate
              .map((item) => item.assignedParticipantId)
              .filter((id): id is string => !!id)
          ),
        ]

        const participantMap = new Map<string, string>()
        if (participantIds.length > 0) {
          const found = await fastify.db
            .select({
              participantId: participants.participantId,
              planId: participants.planId,
            })
            .from(participants)
            .where(inArray(participants.participantId, participantIds))
          for (const p of found) {
            participantMap.set(p.participantId, p.planId)
          }
        }

        const validValues: Array<{
          planId: string
          name: string
          category: ItemCategory
          quantity: number
          unit: Unit
          status: ItemStatus
          subcategory?: string | null
          notes?: string | null
          assignedParticipantId: string | null
        }> = []
        const errors: BulkItemError[] = []

        for (const item of itemsToCreate) {
          const { category, unit, assignedParticipantId, ...rest } = item

          if (category === 'food' && !unit) {
            errors.push({
              name: item.name,
              message: 'Unit is required for food items',
            })
            continue
          }

          if (assignedParticipantId) {
            const pPlanId = participantMap.get(assignedParticipantId)
            if (!pPlanId) {
              errors.push({
                name: item.name,
                message: 'Participant not found',
              })
              continue
            }
            if (pPlanId !== planId) {
              errors.push({
                name: item.name,
                message: 'Participant does not belong to this plan',
              })
              continue
            }
          }

          const resolvedUnit = category === 'equipment' ? 'pcs' : unit!
          validValues.push({
            planId,
            category,
            unit: resolvedUnit,
            assignedParticipantId: assignedParticipantId ?? null,
            ...rest,
          })
        }

        let createdItems: (typeof items.$inferSelect)[] = []
        if (validValues.length > 0) {
          createdItems = await fastify.db
            .insert(items)
            .values(validValues)
            .returning()
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          { planId, created: createdItems.length, failed: errors.length },
          'Bulk items created'
        )
        return reply.status(statusCode).send({ items: createdItems, errors })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to bulk create items')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply
            .status(503)
            .send({ message: 'Database connection error' })
        }

        return reply
          .status(500)
          .send({ message: 'Failed to bulk create items' })
      }
    }
  )

  fastify.patch<{
    Params: { planId: string }
    Body: { items: Array<{ itemId: string } & UpdateItemBody> }
  }>(
    '/plans/:planId/items/bulk',
    {
      schema: {
        tags: ['items'],
        summary: 'Bulk update items in a plan',
        description:
          'Update multiple items at once. Each item is validated independently — valid items are updated, invalid items are reported in the errors array with their name.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'BulkUpdateItemBody#' },
        response: {
          200: { $ref: 'BulkItemResponse#' },
          207: { $ref: 'BulkItemResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params
      const { items: itemUpdates } = request.body

      try {
        const itemIds = itemUpdates.map((entry) => entry.itemId)
        const existingItems = await fastify.db
          .select({
            itemId: items.itemId,
            planId: items.planId,
            name: items.name,
          })
          .from(items)
          .where(inArray(items.itemId, itemIds))

        const itemMap = new Map(existingItems.map((i) => [i.itemId, i]))

        const participantIds = [
          ...new Set(
            itemUpdates
              .map((entry) => entry.assignedParticipantId)
              .filter((id): id is string => id !== undefined && id !== null)
          ),
        ]

        const participantMap = new Map<string, string>()
        if (participantIds.length > 0) {
          const found = await fastify.db
            .select({
              participantId: participants.participantId,
              planId: participants.planId,
            })
            .from(participants)
            .where(inArray(participants.participantId, participantIds))
          for (const p of found) {
            participantMap.set(p.participantId, p.planId)
          }
        }

        const updatedItems: (typeof items.$inferSelect)[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const { itemId, ...updates } = entry
          const existing = itemMap.get(itemId)

          if (!existing) {
            errors.push({
              name: entry.name || itemId,
              message: 'Item not found',
            })
            continue
          }

          if (existing.planId !== planId) {
            errors.push({
              name: existing.name,
              message: 'Item does not belong to this plan',
            })
            continue
          }

          if (Object.keys(updates).length === 0) {
            errors.push({
              name: existing.name,
              message: 'No fields to update',
            })
            continue
          }

          if (
            updates.assignedParticipantId !== undefined &&
            updates.assignedParticipantId !== null
          ) {
            const pPlanId = participantMap.get(updates.assignedParticipantId)
            if (!pPlanId) {
              errors.push({
                name: existing.name,
                message: 'Participant not found',
              })
              continue
            }
            if (pPlanId !== planId) {
              errors.push({
                name: existing.name,
                message: 'Participant does not belong to this plan',
              })
              continue
            }
          }

          const [updatedItem] = await fastify.db
            .update(items)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(items.itemId, itemId))
            .returning()

          updatedItems.push(updatedItem)
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          { planId, updated: updatedItems.length, failed: errors.length },
          'Bulk items updated'
        )
        return reply.status(statusCode).send({ items: updatedItems, errors })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to bulk update items')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply
            .status(503)
            .send({ message: 'Database connection error' })
        }

        return reply
          .status(500)
          .send({ message: 'Failed to bulk update items' })
      }
    }
  )
}
