import { randomBytes } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { participants, plans, DietaryMembers } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { removeParticipantFromAssignments } from '../services/item.service.js'
import { config } from '../config.js'
import {
  resolveLanguage,
  inviteMessage,
} from '../services/whatsapp/messages.js'
import { fireAndForgetNotification } from '../services/whatsapp/notify.js'

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

interface CreateParticipantBody {
  name: string
  lastName: string
  contactPhone: string
  displayName?: string
  role?: 'participant' | 'viewer'
  avatarUrl?: string
  contactEmail?: string
  adultsCount?: number
  kidsCount?: number
  foodPreferences?: string
  allergies?: string
  dietaryMembers?: DietaryMembers
  notes?: string
}

interface UpdateParticipantBody {
  name?: string
  lastName?: string
  contactPhone?: string
  displayName?: string | null
  role?: 'participant' | 'viewer'
  avatarUrl?: string | null
  contactEmail?: string | null
  adultsCount?: number | null
  kidsCount?: number | null
  foodPreferences?: string | null
  allergies?: string | null
  dietaryMembers?: DietaryMembers | null
  notes?: string | null
  rsvpStatus?: 'pending' | 'confirmed' | 'not_sure'
}

export async function participantsRoutes(fastify: FastifyInstance) {
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

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/participants',
    {
      schema: {
        tags: ['participants'],
        summary: 'List all participants for a plan',
        description: 'Retrieve all participants belonging to a specific plan',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'List of participants',
            $ref: 'ParticipantList#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — participant or plan does not exist',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const { allowed, plan } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed || !plan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const planParticipants = await fastify.db
          .select()
          .from(participants)
          .where(eq(participants.planId, planId))
          .orderBy(participants.createdAt)

        const isOwner = plan.createdByUserId === request.user!.id

        const result = isOwner
          ? planParticipants
          : planParticipants.map((p) => ({ ...p, inviteToken: null }))

        request.log.info(
          { planId, count: planParticipants.length },
          'Plan participants retrieved'
        )
        return result
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
          201: {
            description: 'Created participant',
            $ref: 'Participant#',
          },
          400: {
            description: 'Bad request — check the message field for details',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — participant or plan does not exist',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.params

      try {
        const [existingPlan] = await fastify.db
          .select({
            planId: plans.planId,
            title: plans.title,
            defaultLang: plans.defaultLang,
          })
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
            inviteToken: generateInviteToken(),
          })
          .returning()

        request.log.info(
          { participantId: createdParticipant.participantId, planId },
          'Participant created'
        )

        if (createdParticipant.contactPhone && createdParticipant.inviteToken) {
          const lang = resolveLanguage(existingPlan.defaultLang)
          const deepLink = `${config.frontendUrl}/invite/${planId}/${createdParticipant.inviteToken}`
          const planTitle =
            existingPlan.title ?? (lang === 'he' ? 'תוכנית' : 'a plan')
          const msg = inviteMessage(lang, { planTitle, deepLink })
          fireAndForgetNotification({
            whatsapp: fastify.whatsapp,
            db: fastify.db,
            log: request.log,
            phone: createdParticipant.contactPhone,
            message: msg,
            planId,
            recipientParticipantId: createdParticipant.participantId,
            type: 'invitation_sent',
            onSuccess: () => {
              fastify.db
                .update(participants)
                .set({
                  inviteStatus: 'invited',
                  updatedAt: new Date(),
                })
                .where(
                  eq(
                    participants.participantId,
                    createdParticipant.participantId
                  )
                )
                .catch((dbErr) =>
                  request.log.warn(
                    { err: dbErr },
                    'Failed to update inviteStatus'
                  )
                )
            },
          })
        }

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
          200: {
            description: 'Participant details',
            $ref: 'Participant#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — participant or plan does not exist',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
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

        const [plan] = await fastify.db
          .select({ createdByUserId: plans.createdByUserId })
          .from(plans)
          .where(eq(plans.planId, participant.planId))

        const isOwner = plan?.createdByUserId === request.user!.id

        const result = isOwner
          ? participant
          : { ...participant, inviteToken: null }

        request.log.info({ participantId }, 'Participant retrieved')
        return result
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
        description:
          'Update an existing participant by its ID. Owner/admin can update any participant; linked participants can only update their own record.',
        params: { $ref: 'ParticipantIdParam#' },
        body: { $ref: 'UpdateParticipantBody#' },
        response: {
          200: {
            description: 'Updated participant',
            $ref: 'Participant#',
          },
          400: {
            description: 'Bad request — check the message field for details',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'Forbidden — insufficient permissions',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — participant or plan does not exist',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
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
            planId: participants.planId,
            userId: participants.userId,
            role: participants.role,
          })
          .from(participants)
          .where(eq(participants.participantId, participantId))

        if (!existingParticipant) {
          return reply.status(404).send({
            message: 'Participant not found',
          })
        }

        const [plan] = await fastify.db
          .select({ createdByUserId: plans.createdByUserId })
          .from(plans)
          .where(eq(plans.planId, existingParticipant.planId))

        const userId = request.user!.id
        const isOwner = plan?.createdByUserId === userId
        const isSelf =
          existingParticipant.userId !== null &&
          existingParticipant.userId === userId

        if (!isOwner && !isSelf) {
          return reply.status(403).send({
            message: 'You can only edit your own preferences',
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

        const result = isOwner
          ? updatedParticipant
          : { ...updatedParticipant, inviteToken: null }

        request.log.info(
          { participantId, changes: Object.keys(updates) },
          'Participant updated'
        )
        return result
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
          200: {
            description: 'Participant deleted',
            $ref: 'DeleteParticipantResponse#',
          },
          400: {
            description: 'Bad request — check the message field for details',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — participant or plan does not exist',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { participantId } = request.params

      try {
        const [existingParticipant] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
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

        const updatedItems = await removeParticipantFromAssignments(
          fastify.db,
          existingParticipant.planId,
          participantId
        )
        if (updatedItems > 0) {
          request.log.info(
            { participantId, updatedItems },
            'Removed participant from item assignments'
          )
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

  fastify.post<{ Params: { planId: string; participantId: string } }>(
    '/plans/:planId/participants/:participantId/regenerate-token',
    {
      schema: {
        tags: ['participants'],
        summary: 'Regenerate invite token for a participant',
        description:
          'Generates a new invite token for the specified participant, invalidating the previous one. Requires API key (owner action).',
        params: { $ref: 'RegenerateTokenParams#' },
        response: {
          200: {
            description: 'Regenerated invite token',
            $ref: 'RegenerateTokenResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — participant or plan does not exist',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
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
