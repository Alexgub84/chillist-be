import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'

async function internalAuthPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('internalUserId', null)

  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    if (!request.url.startsWith('/api/internal')) return
    if (request.method === 'OPTIONS') return

    const serviceKey = request.headers['x-service-key']
    const expectedKey = process.env.CHATBOT_SERVICE_KEY

    if (
      !serviceKey ||
      typeof serviceKey !== 'string' ||
      !expectedKey ||
      serviceKey !== expectedKey
    ) {
      request.log.warn(
        { url: request.url, method: request.method },
        'Internal API request rejected — invalid or missing x-service-key'
      )
      return reply.code(401).send({ message: 'Unauthorized' })
    }

    const userId = request.headers['x-user-id']
    if (userId && typeof userId === 'string') {
      request.internalUserId = userId
    }
  })
}

export default fp(internalAuthPlugin, { name: 'internal-auth' })
