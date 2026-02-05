import { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        description: 'Check if the server and database are healthy',
        response: {
          200: { $ref: 'HealthResponse#' },
        },
      },
    },
    async (_request, reply) => {
      try {
        await fastify.db.execute(sql`SELECT 1`)
        return { status: 'healthy', database: 'connected' }
      } catch (err) {
        fastify.log.error({ err }, 'Health check failed - database unreachable')
        return reply
          .status(503)
          .send({ status: 'unhealthy', database: 'disconnected' })
      }
    }
  )
}
