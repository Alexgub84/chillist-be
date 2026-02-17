import { FastifyInstance } from 'fastify'

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Get current user from JWT',
        description:
          'Returns the authenticated user identity extracted from the JWT. Returns 401 if no valid JWT is provided.',
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                },
                required: ['id', 'email', 'role'],
              },
            },
            required: ['user'],
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      return { user: request.user }
    }
  )
}
