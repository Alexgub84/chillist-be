import { randomBytes } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { participants } from '../db/schema.js'
import * as schema from '../db/schema.js'

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

export async function inviteRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { planId: string; inviteToken: string } }>(
    '/plans/:planId/invite/:inviteToken',
    {
      schema: {
        tags: ['invite'],
        summary: 'Access a plan via invite link',
        description:
          'Public endpoint. Validates the invite token and returns plan data with items. Participant PII is stripped — only displayName and role are included.',
        params: { $ref: 'InviteParams#' },
        response: {
          200: { $ref: 'InvitePlanResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, inviteToken } = request.params

      try {
        const [participant] = await fastify.db
          .select({ participantId: participants.participantId })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          return reply.status(404).send({
            message: 'Invalid or expired invite link',
          })
        }

        const plan = await fastify.db.query.plans.findFirst({
          where: eq(schema.plans.planId, planId),
          with: {
            items: true,
            participants: true,
          },
        })

        if (!plan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const filteredParticipants = plan.participants.map((p) => ({
          participantId: p.participantId,
          displayName: p.displayName,
          role: p.role,
        }))

        const filteredItems = plan.items.filter(
          (item) =>
            !item.assignedParticipantId ||
            item.assignedParticipantId === participant.participantId
        )

        request.log.info(
          {
            planId,
            invitedParticipantId: participant.participantId,
            totalItems: plan.items.length,
            visibleItems: filteredItems.length,
          },
          'Plan accessed via invite link'
        )

        return {
          planId: plan.planId,
          title: plan.title,
          description: plan.description,
          status: plan.status,
          location: plan.location,
          startDate: plan.startDate,
          endDate: plan.endDate,
          tags: plan.tags,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
          items: filteredItems,
          participants: filteredParticipants,
        }
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to access plan via invite'
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
          message: 'Failed to access plan',
        })
      }
    }
  )

  fastify.post<{ Params: { planId: string; participantId: string } }>(
    '/plans/:planId/participants/:participantId/regenerate-token',
    {
      schema: {
        tags: ['invite'],
        summary: 'Regenerate invite token for a participant',
        description:
          'Generates a new invite token for the specified participant, invalidating the previous one. Requires API key (owner action).',
        params: { $ref: 'RegenerateTokenParams#' },
        response: {
          200: { $ref: 'RegenerateTokenResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, participantId } = request.params

      try {
        const [existing] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
          })
          .from(participants)
          .where(eq(participants.participantId, participantId))

        if (!existing || existing.planId !== planId) {
          return reply.status(404).send({
            message: 'Participant not found in this plan',
          })
        }

        const newToken = generateInviteToken()

        await fastify.db
          .update(participants)
          .set({ inviteToken: newToken, updatedAt: new Date() })
          .where(eq(participants.participantId, participantId))

        request.log.info({ participantId, planId }, 'Invite token regenerated')

        return { inviteToken: newToken }
      } catch (error) {
        request.log.error(
          { err: error, participantId, planId },
          'Failed to regenerate invite token'
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
          message: 'Failed to regenerate invite token',
        })
      }
    }
  )
}
