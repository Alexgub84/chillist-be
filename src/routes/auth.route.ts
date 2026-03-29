import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { users, PREFERRED_LANG_VALUES } from '../db/schema.js'
import { syncAllParticipantsForUser } from '../services/profile-sync.js'
import { fetchSupabaseUserMetadata } from '../utils/supabase-admin.js'
import { normalizePhone } from '../utils/phone.js'

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
            description: 'Authenticated user identity',
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
              sessionId: {
                type: 'string',
                nullable: true,
                description:
                  'Supabase session ID — stable across token refreshes, changes on new login. Use this as a correlation key for client-side logging and analytics.',
              },
            },
            required: ['user'],
          },
          401: {
            description: 'JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      return { user: request.user, sessionId: request.sessionId ?? null }
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
          200: {
            description: 'User identity and preferences',
            $ref: 'ProfileResponse#',
          },
          401: {
            description: 'JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      const [row] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.userId, request.user.id))

      return {
        user: request.user,
        preferences: row
          ? {
              phone: row.phone,
              preferredLang: row.preferredLang,
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
          200: {
            description: 'Updated preferences',
            $ref: 'UpdateProfileResponse#',
          },
          401: {
            description: 'JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      const body = request.body as {
        phone?: string | null
        preferredLang?: string | null
        foodPreferences?: string | null
        allergies?: string | null
        defaultEquipment?: string[] | null
      }

      if (
        body.preferredLang !== undefined &&
        body.preferredLang !== null &&
        !PREFERRED_LANG_VALUES.includes(
          body.preferredLang as (typeof PREFERRED_LANG_VALUES)[number]
        )
      ) {
        return reply.status(400).send({
          message: `Invalid preferredLang. Allowed values: ${PREFERRED_LANG_VALUES.join(', ')}`,
        })
      }

      const normalizedPhone =
        body.phone === undefined || body.phone === null
          ? body.phone
          : normalizePhone(body.phone)

      const [row] = await fastify.db
        .insert(users)
        .values({
          userId: request.user.id,
          phone: normalizedPhone ?? null,
          preferredLang: body.preferredLang ?? null,
          foodPreferences: body.foodPreferences ?? null,
          allergies: body.allergies ?? null,
          defaultEquipment: body.defaultEquipment ?? null,
        })
        .onConflictDoUpdate({
          target: users.userId,
          set: {
            ...(body.phone !== undefined && { phone: normalizedPhone }),
            ...(body.preferredLang !== undefined && {
              preferredLang: body.preferredLang,
            }),
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
          phone: row.phone,
          preferredLang: row.preferredLang,
          foodPreferences: row.foodPreferences,
          allergies: row.allergies,
          defaultEquipment: row.defaultEquipment,
        },
      }
    }
  )

  fastify.post(
    '/auth/sync-profile',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Sync JWT identity to all participant records',
        description:
          'Updates all participant records linked to the authenticated user with identity fields from the JWT (name, email, phone, avatar). Call this after updating the user profile in Supabase so all plans reflect the latest data.',
        response: {
          200: {
            description: 'Number of participant records synced',
            type: 'object',
            properties: {
              synced: { type: 'integer' },
            },
            required: ['synced'],
          },
          401: {
            description: 'JWT token missing or invalid',
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
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      try {
        const supabaseMeta = await fetchSupabaseUserMetadata(
          request.user.id,
          request.log
        )

        if (supabaseMeta?.phone) {
          const normalizedPhone = normalizePhone(supabaseMeta.phone)
          await fastify.db
            .insert(users)
            .values({ userId: request.user.id, phone: normalizedPhone })
            .onConflictDoUpdate({
              target: users.userId,
              set: { phone: normalizedPhone, updatedAt: new Date() },
            })
          request.log.info(
            { userId: request.user.id },
            'users.phone upserted from Supabase metadata'
          )
        }

        const user =
          supabaseMeta?.phone && !request.user.phone
            ? { ...request.user, phone: supabaseMeta.phone }
            : request.user

        const synced = await syncAllParticipantsForUser(
          fastify.db,
          user,
          request.log
        )

        return { synced }
      } catch (error) {
        request.log.error(
          { err: error, userId: request.user.id },
          'Failed to sync profile to participants'
        )
        return reply.status(500).send({ message: 'Failed to sync profile' })
      }
    }
  )
}
