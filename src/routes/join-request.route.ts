import { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { plans, participantJoinRequests } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'

interface CreateJoinRequestBody {
  name: string
  lastName: string
  contactPhone: string
  displayName?: string
  contactEmail?: string
  adultsCount?: number
  kidsCount?: number
  foodPreferences?: string
  allergies?: string
  notes?: string
}

export async function joinRequestRoutes(fastify: FastifyInstance) {
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

  fastify.post<{
    Params: { planId: string }
    Body: CreateJoinRequestBody
  }>(
    '/plans/:planId/join-requests',
    {
      schema: {
        tags: ['plans'],
        summary: 'Request to join a plan',
        description:
          'Creates a join request for the authenticated user. Idempotent: returns existing request if one already exists. Plan must exist and user must not already be a participant.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'CreateJoinRequestBody#' },
        response: {
          201: { $ref: 'JoinRequest#' },
          200: { $ref: 'JoinRequest#' },
          400: { $ref: 'ErrorResponse#' },
          401: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          409: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params
      const body = request.body
      const userId = request.user!.id

      try {
        const [plan] = await fastify.db
          .select()
          .from(plans)
          .where(eq(plans.planId, planId))
          .limit(1)

        if (!plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (allowed) {
          return reply.status(400).send({
            message: 'Already a participant. Join request is not needed.',
          })
        }

        const [existing] = await fastify.db
          .select()
          .from(participantJoinRequests)
          .where(
            and(
              eq(participantJoinRequests.planId, planId),
              eq(participantJoinRequests.supabaseUserId, userId)
            )
          )
          .limit(1)

        if (existing) {
          request.log.info(
            { planId, userId, requestId: existing.requestId },
            'Join request already exists, returning existing'
          )
          return reply.status(200).send({
            requestId: existing.requestId,
            planId: existing.planId,
            supabaseUserId: existing.supabaseUserId,
            name: existing.name,
            lastName: existing.lastName,
            contactPhone: existing.contactPhone,
            contactEmail: existing.contactEmail,
            displayName: existing.displayName,
            adultsCount: existing.adultsCount,
            kidsCount: existing.kidsCount,
            foodPreferences: existing.foodPreferences,
            allergies: existing.allergies,
            notes: existing.notes,
            status: existing.status,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          })
        }

        const [created] = await fastify.db
          .insert(participantJoinRequests)
          .values({
            planId,
            supabaseUserId: userId,
            name: body.name,
            lastName: body.lastName,
            contactPhone: body.contactPhone,
            contactEmail: body.contactEmail ?? null,
            displayName: body.displayName ?? null,
            adultsCount: body.adultsCount ?? null,
            kidsCount: body.kidsCount ?? null,
            foodPreferences: body.foodPreferences ?? null,
            allergies: body.allergies ?? null,
            notes: body.notes ?? null,
          })
          .returning()

        request.log.info(
          { planId, userId, requestId: created.requestId },
          'Join request created'
        )

        return reply.status(201).send({
          requestId: created.requestId,
          planId: created.planId,
          supabaseUserId: created.supabaseUserId,
          name: created.name,
          lastName: created.lastName,
          contactPhone: created.contactPhone,
          contactEmail: created.contactEmail,
          displayName: created.displayName,
          adultsCount: created.adultsCount,
          kidsCount: created.kidsCount,
          foodPreferences: created.foodPreferences,
          allergies: created.allergies,
          notes: created.notes,
          status: created.status,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        })
      } catch (error) {
        request.log.error(
          { err: error, planId, userId },
          'Failed to create join request'
        )

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply.status(503).send({
            message: 'Database connection error',
          })
        }

        return reply.status(500).send({
          message: 'Failed to create join request',
        })
      }
    }
  )
}
