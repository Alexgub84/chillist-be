import { FastifyInstance } from 'fastify'
import { getPlanTags } from '../services/plan-tags.service.js'

export async function planTagsRoutes(fastify: FastifyInstance) {
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

  fastify.get(
    '/plan-tags',
    {
      schema: {
        tags: ['plan-tags'],
        summary: 'Get plan tag taxonomy',
        description:
          'Returns the full plan tag taxonomy (tier1 archetypes, universal flags, tier2 axes, tier3 specifics) used by the plan creation wizard. Served from a static versioned JSON file bundled with the server.',
        response: {
          200: {
            description: 'Full plan tag taxonomy',
            $ref: 'PlanTagsResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const tags = getPlanTags()
        request.log.info({ version: tags['version'] }, 'Plan tags retrieved')
        return tags
      } catch (err) {
        request.log.error({ err }, 'Failed to retrieve plan tags')
        return reply
          .status(500)
          .send({ message: 'Failed to retrieve plan tags' })
      }
    }
  )
}
