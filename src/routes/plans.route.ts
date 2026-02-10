import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { plans, NewPlan } from '../db/schema.js'
import * as schema from '../db/schema.js'

export async function plansRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: NewPlan }>(
    '/plans',
    {
      schema: {
        tags: ['plans'],
        summary: 'Create a new plan',
        description: 'Create a new plan with the provided details',
        body: { $ref: 'CreatePlanBody#' },
        response: {
          201: { $ref: 'Plan#' },
          400: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { startDate, endDate, ...rest } = request.body
        const values = {
          ...rest,
          ...(startDate && { startDate: new Date(String(startDate)) }),
          ...(endDate && { endDate: new Date(String(endDate)) }),
        }

        const [createdPlan] = await fastify.db
          .insert(plans)
          .values(values)
          .returning()

        request.log.info({ planId: createdPlan.planId }, 'Plan created')
        return reply.status(201).send(createdPlan)
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create plan')

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
          message: 'Failed to create plan',
        })
      }
    }
  )

  fastify.get(
    '/plans',
    {
      schema: {
        tags: ['plans'],
        summary: 'List all plans',
        description: 'Retrieve all plans ordered by creation date',
        response: {
          200: { $ref: 'PlanList#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      try {
        const allPlans = await fastify.db
          .select()
          .from(plans)
          .orderBy(plans.createdAt)

        request.log.info({ count: allPlans.length }, 'Plans retrieved')
        return allPlans
      } catch (error) {
        request.log.error({ err: error }, 'Failed to retrieve plans')

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
          message: 'Failed to retrieve plans',
        })
      }
    }
  )

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Get plan by ID',
        description: 'Retrieve a single plan by its ID with associated items',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'PlanWithItems#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const plan = await fastify.db.query.plans.findFirst({
          where: eq(schema.plans.planId, planId),
          with: {
            items: true,
          },
        })

        if (!plan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        request.log.info({ planId }, 'Plan retrieved')
        return plan
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to retrieve plan')

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
          message: 'Failed to retrieve plan',
        })
      }
    }
  )

  fastify.delete<{ Params: { planId: string } }>(
    '/plans/:planId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Delete a plan',
        description:
          'Delete a plan by its ID. Cascade delete handles related items, participants, and assignments.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'DeletePlanResponse#' },
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

        await fastify.db.delete(plans).where(eq(plans.planId, planId))

        request.log.info({ planId }, 'Plan deleted')
        return reply.status(200).send({ ok: true })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to delete plan')

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
          message: 'Failed to delete plan',
        })
      }
    }
  )
}
