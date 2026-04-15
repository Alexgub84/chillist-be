import { FastifyInstance } from 'fastify'
import { getPlanTags } from '../services/plan-tags.service.js'

export async function planTagsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/plan-tags',
    {
      schema: {
        tags: ['plan-tags'],
        summary: 'Get plan tag taxonomy',
        description:
          'Full plan tag taxonomy from the bundled JSON (wizard fields plus structural_contract, design_principles, changelog). Same document as GET /api/internal/plan-tags. No authentication. Served from a static versioned JSON file.',
        response: {
          200: {
            description: 'Full plan tag taxonomy',
            $ref: 'PlanTagsResponse#',
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
