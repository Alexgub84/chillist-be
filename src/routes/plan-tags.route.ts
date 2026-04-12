import { FastifyInstance } from 'fastify'
import { getLatestTagTaxonomy } from '../services/plan-tags.service.js'

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
          'Returns the full 3-tier plan tag taxonomy (plan types, logistics, specifics) used by the plan creation wizard. Response matches the structure expected by PlanTagWizard and tag-utils on the frontend.',
        response: {
          200: {
            description:
              'Full tag taxonomy with version, tier labels, and all options',
            $ref: 'PlanTagsResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'No tag taxonomy found in the database',
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
        const taxonomy = await getLatestTagTaxonomy(fastify.db)
        if (!taxonomy) {
          request.log.warn(
            'Plan tags requested but no taxonomy found in database'
          )
          return reply.status(404).send({ message: 'No tag taxonomy found' })
        }
        request.log.info({ version: taxonomy.version }, 'Plan tags retrieved')
        return taxonomy
      } catch (err) {
        request.log.error({ err }, 'Failed to retrieve plan tags')
        return reply
          .status(500)
          .send({ message: 'Failed to retrieve plan tags' })
      }
    }
  )
}
