import { FastifyInstance } from 'fastify'
import { plans } from '../db/schema.js'

export async function plansRoutes(fastify: FastifyInstance) {
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
}
