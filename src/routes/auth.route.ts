import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { userDetails } from '../db/schema.js'

const AUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/auth/me',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
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

  fastify.get(
    '/auth/profile',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Get current user profile',
        description:
          'Returns user identity from JWT and app preferences from the database. Returns 401 if no valid JWT is provided.',
        response: {
          200: { $ref: 'ProfileResponse#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      const [row] = await fastify.db
        .select()
        .from(userDetails)
        .where(eq(userDetails.userId, request.user.id))

      return {
        user: request.user,
        preferences: row
          ? {
              foodPreferences: row.foodPreferences,
              allergies: row.allergies,
              defaultEquipment: row.defaultEquipment,
            }
          : null,
      }
    }
  )

  fastify.patch(
    '/auth/profile',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Update user preferences',
        description:
          "Creates or updates the authenticated user's app preferences. Returns 401 if no valid JWT is provided.",
        body: { $ref: 'UpdateProfileBody#' },
        response: {
          200: { $ref: 'UpdateProfileResponse#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      const body = request.body as {
        foodPreferences?: string | null
        allergies?: string | null
        defaultEquipment?: string[] | null
      }

      const [row] = await fastify.db
        .insert(userDetails)
        .values({
          userId: request.user.id,
          foodPreferences: body.foodPreferences ?? null,
          allergies: body.allergies ?? null,
          defaultEquipment: body.defaultEquipment ?? null,
        })
        .onConflictDoUpdate({
          target: userDetails.userId,
          set: {
            ...(body.foodPreferences !== undefined && {
              foodPreferences: body.foodPreferences,
            }),
            ...(body.allergies !== undefined && {
              allergies: body.allergies,
            }),
            ...(body.defaultEquipment !== undefined && {
              defaultEquipment: body.defaultEquipment,
            }),
            updatedAt: new Date(),
          },
        })
        .returning()

      return {
        preferences: {
          foodPreferences: row.foodPreferences,
          allergies: row.allergies,
          defaultEquipment: row.defaultEquipment,
        },
      }
    }
  )
}
