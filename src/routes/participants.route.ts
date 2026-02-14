import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { participants, plans } from '../db/schema.js'

interface CreateParticipantBody {
  name: string
  lastName: string
  contactPhone: string
  displayName?: string
  role?: 'participant' | 'viewer'
  avatarUrl?: string
  contactEmail?: string
}

interface UpdateParticipantBody {
  name?: string
  lastName?: string
  contactPhone?: string
  displayName?: string | null
  role?: 'participant' | 'viewer'
  avatarUrl?: string | null
  contactEmail?: string | null
}

export async function participantsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/participants',
    {
      schema: {
        tags: ['participants'],
        summary: 'List all participants for a plan',
        description: 'Retrieve all participants belonging to a specific plan',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'ParticipantList#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const planParticipants = await fastify.db
          .select()
          .from(participants)
          .where(eq(participants.planId, planId))
          .orderBy(participants.createdAt)

        request.log.info(
          { planId, count: planParticipants.length },
          'Plan participants retrieved'
        )
        return planParticipants
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to retrieve plan participants'
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
          message: 'Failed to retrieve plan participants',
        })
      }
    }
  )

  fastify.post<{ Params: { planId: string }; Body: CreateParticipantBody }>(
    '/plans/:planId/participants',
    {
      schema: {
        tags: ['participants'],
        summary: '[UPDATED] Add a participant to a plan',
        description:
          'Create a new participant in the specified plan. Required fields changed: now requires name, lastName, contactPhone instead of displayName.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'CreateParticipantBody#' },
        response: {
          201: { $ref: 'Participant#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const [createdParticipant] = await fastify.db
          .insert(participants)
          .values({
            planId,
            ...request.body,
          })
          .returning()

        request.log.info(
          { participantId: createdParticipant.participantId, planId },
          'Participant created'
        )
        return reply.status(201).send(createdParticipant)
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to create participant'
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
          message: 'Failed to create participant',
        })
      }
    }
  )

  fastify.get<{ Params: { participantId: string } }>(
    '/participants/:participantId',
    {
      schema: {
        tags: ['participants'],
        summary: 'Get participant by ID',
        description: 'Retrieve a single participant by its ID',
        params: { $ref: 'ParticipantIdParam#' },
        response: {
          200: { $ref: 'Participant#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { participantId } = request.params

      try {
        const [participant] = await fastify.db
          .select()
          .from(participants)
          .where(eq(participants.participantId, participantId))

        if (!participant) {
          return reply.status(404).send({
            message: 'Participant not found',
          })
        }

        request.log.info({ participantId }, 'Participant retrieved')
        return participant
      } catch (error) {
        request.log.error(
          { err: error, participantId },
          'Failed to retrieve participant'
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
          message: 'Failed to retrieve participant',
        })
      }
    }
  )

  fastify.patch<{
    Params: { participantId: string }
    Body: UpdateParticipantBody
  }>(
    '/participants/:participantId',
    {
      schema: {
        tags: ['participants'],
        summary: 'Update a participant',
        description: 'Update an existing participant by its ID',
        params: { $ref: 'ParticipantIdParam#' },
        body: { $ref: 'UpdateParticipantBody#' },
        response: {
          200: { $ref: 'Participant#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { participantId } = request.params
      const updates = request.body

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          message: 'No fields to update',
        })
      }

      try {
        const [existingParticipant] = await fastify.db
          .select({
            participantId: participants.participantId,
            role: participants.role,
          })
          .from(participants)
          .where(eq(participants.participantId, participantId))

        if (!existingParticipant) {
          return reply.status(404).send({
            message: 'Participant not found',
          })
        }

        if (existingParticipant.role === 'owner' && updates.role) {
          return reply.status(400).send({
            message: 'Cannot change role of owner participant',
          })
        }

        const [updatedParticipant] = await fastify.db
          .update(participants)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(participants.participantId, participantId))
          .returning()

        request.log.info(
          { participantId, changes: Object.keys(updates) },
          'Participant updated'
        )
        return updatedParticipant
      } catch (error) {
        request.log.error(
          { err: error, participantId },
          'Failed to update participant'
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
          message: 'Failed to update participant',
        })
      }
    }
  )

  fastify.delete<{ Params: { participantId: string } }>(
    '/participants/:participantId',
    {
      schema: {
        tags: ['participants'],
        summary: 'Delete a participant',
        description:
          'Delete a participant by its ID. Items assigned to this participant will have their assignment cleared.',
        params: { $ref: 'ParticipantIdParam#' },
        response: {
          200: { $ref: 'DeleteParticipantResponse#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { participantId } = request.params

      try {
        const [existingParticipant] = await fastify.db
          .select({
            participantId: participants.participantId,
            role: participants.role,
          })
          .from(participants)
          .where(eq(participants.participantId, participantId))

        if (!existingParticipant) {
          return reply.status(404).send({
            message: 'Participant not found',
          })
        }

        if (existingParticipant.role === 'owner') {
          request.log.warn(
            { participantId },
            'Attempted to delete owner participant'
          )
          return reply.status(400).send({
            message: 'Cannot delete participant with owner role',
          })
        }

        await fastify.db
          .delete(participants)
          .where(eq(participants.participantId, participantId))

        request.log.info({ participantId }, 'Participant deleted')
        return reply.status(200).send({ ok: true })
      } catch (error) {
        request.log.error(
          { err: error, participantId },
          'Failed to delete participant'
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
          message: 'Failed to delete participant',
        })
      }
    }
  )
}
