import { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { participants, userDetails } from '../db/schema.js'
import { buildIdentityFields } from '../services/profile-sync.js'

export async function claimRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { planId: string; inviteToken: string } }>(
    '/plans/:planId/claim/:inviteToken',
    {
      schema: {
        tags: ['auth'],
        summary: 'Claim a participant spot via invite token',
        description:
          'Links an authenticated user (JWT) to an existing participant record identified by the invite token. After claiming, the user can access the plan via JWT without the invite token.',
        params: { $ref: 'InviteParams#' },
        response: {
          200: { $ref: 'Participant#' },
          400: { $ref: 'ErrorResponse#' },
          401: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' })
      }

      const { planId, inviteToken } = request.params
      const userId = request.user.id

      try {
        const [participant] = await fastify.db
          .select()
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, userId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Claim rejected — invalid invite token'
          )
          return reply
            .status(404)
            .send({ message: 'Invalid invite token or plan not found' })
        }

        if (participant.userId && participant.userId !== userId) {
          request.log.warn(
            { planId, userId, existingUserId: participant.userId },
            'Claim rejected — participant linked to another account'
          )
          return reply.status(400).send({
            message: 'This participant is already linked to another account',
          })
        }

        if (participant.userId === userId) {
          request.log.info(
            { participantId: participant.participantId, planId, userId },
            'Claim request is idempotent — participant already linked to this user'
          )
          return participant
        }

        const [existingParticipant] = await fastify.db
          .select({ participantId: participants.participantId })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.userId, userId)
            )
          )
          .limit(1)

        if (existingParticipant) {
          request.log.warn(
            { planId, userId },
            'Claim rejected — user already a participant in this plan'
          )
          return reply.status(400).send({
            message: 'You are already a participant in this plan',
          })
        }

        const updateFields: Record<string, unknown> = {
          userId,
          inviteStatus: 'accepted' as const,
          inviteToken: null,
          updatedAt: new Date(),
          ...buildIdentityFields(request.user),
        }

        if (!participant.foodPreferences || !participant.allergies) {
          const [defaults] = await fastify.db
            .select()
            .from(userDetails)
            .where(eq(userDetails.userId, userId))

          if (defaults) {
            if (!participant.foodPreferences && defaults.foodPreferences) {
              updateFields.foodPreferences = defaults.foodPreferences
            }
            if (!participant.allergies && defaults.allergies) {
              updateFields.allergies = defaults.allergies
            }
          }
        }

        const [updated] = await fastify.db
          .update(participants)
          .set(updateFields)
          .where(eq(participants.participantId, participant.participantId))
          .returning()

        request.log.info(
          {
            participantId: updated.participantId,
            planId,
            userId,
          },
          'Participant claimed — user linked to participant record'
        )

        return updated
      } catch (error) {
        request.log.error(
          { err: error, planId, userId },
          'Failed to claim participant'
        )

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply
            .status(503)
            .send({ message: 'Database connection error' })
        }

        return reply
          .status(500)
          .send({ message: 'Failed to claim participant' })
      }
    }
  )
}
