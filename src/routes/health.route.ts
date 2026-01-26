import { FastifyInstance } from 'fastify'

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (_request, _reply) => {
    fastify.log.info('Health check requested')
    return { ok: true }
  })
}
