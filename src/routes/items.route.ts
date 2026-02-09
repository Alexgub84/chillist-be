import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { items, plans } from '../db/schema.js'

interface CreateItemBody {
  name: string
  category: 'equipment' | 'food'
  quantity: number
  status: 'pending' | 'purchased' | 'packed' | 'canceled'
  unit?: 'pcs' | 'kg' | 'g' | 'lb' | 'oz' | 'l' | 'ml' | 'pack' | 'set'
  notes?: string | null
}

export async function itemsRoutes(fastify: FastifyInstance) {
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
      const { category, unit, ...rest } = request.body

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

        const [createdItem] = await fastify.db
          .insert(items)
          .values({
            planId,
            category,
            unit: resolvedUnit,
            ...rest,
          })
          .returning()

        request.log.info({ itemId: createdItem.itemId, planId }, 'Item created')
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
        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
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
}
