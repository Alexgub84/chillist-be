import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  isValidUuidV4,
  getDeviceType,
  upsertSession,
} from '../services/session.service.js'

async function sessionPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('sessionId', null)

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers['x-session-id']
    if (!header || typeof header !== 'string') return

    if (isValidUuidV4(header)) {
      request.sessionId = header
    }
  })

  fastify.addHook(
    'onResponse',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.sessionId) return
      if (request.url.startsWith('/health')) return

      try {
        const userAgent =
          (request.headers['user-agent'] as string | undefined) ?? ''
        await upsertSession(fastify.db, {
          id: request.sessionId,
          userId: request.user?.id ?? null,
          deviceType: getDeviceType(userAgent),
          userAgent,
        })
      } catch (err) {
        request.log.warn(
          { err, sessionId: request.sessionId },
          'Session upsert failed — non-blocking'
        )
      }
    }
  )
}

export default fp(sessionPlugin, { name: 'session' })
