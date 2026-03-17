import { FastifyInstance } from 'fastify'
import { resolveUserByPhone } from '../services/internal-auth.service.js'
import { normalizePhone } from '../utils/phone.js'

const INTERNAL_RATE_LIMIT = { max: 30, timeWindow: '1 minute' }

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
          200: { $ref: 'IdentifyResponse#' },
          401: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { phoneNumber } = request.body as { phoneNumber: string }
      const phonePrefix = normalizePhone(phoneNumber).slice(0, 4) + '***'

      request.log.info({ phonePrefix }, 'Identifying user by phone')

      const user = await resolveUserByPhone(fastify.db, phoneNumber)

      if (!user) {
        request.log.info({ phonePrefix }, 'User not found')
        return reply.code(404).send({ message: 'User not found' })
      }

      request.log.info({ phonePrefix }, 'User identified')
      return user
    }
  )
}
