import { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import {
  plans,
  participants,
  participantJoinRequests,
  DietaryMembers,
} from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { addParticipantToPlan } from '../services/participant.service.js'
import { config } from '../config.js'
import {
  resolveLanguage,
  joinRequestMessage,
  joinRequestApprovedMessage,
  joinRequestRejectedMessage,
} from '../services/whatsapp/messages.js'
import { fireAndForgetNotification } from '../services/whatsapp/notify.js'

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
  dietaryMembers?: DietaryMembers
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
          201: {
            description: 'Join request created',
            $ref: 'JoinRequest#',
          },
          200: {
            description: 'Join request already exists — returned existing',
            $ref: 'JoinRequest#',
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
            description: 'Not found — plan does not exist',
            $ref: 'ErrorResponse#',
          },
          409: {
            description: 'Conflict — duplicate join request',
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
            dietaryMembers: existing.dietaryMembers,
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
            dietaryMembers: body.dietaryMembers ?? null,
            notes: body.notes ?? null,
          })
          .returning()

        request.log.info(
          { planId, userId, requestId: created.requestId },
          'Join request created'
        )

        if (plan.ownerParticipantId) {
          fastify.db
            .select({ contactPhone: participants.contactPhone })
            .from(participants)
            .where(eq(participants.participantId, plan.ownerParticipantId))
            .limit(1)
            .then(([owner]) => {
              if (!owner?.contactPhone) return
              const lang = resolveLanguage(plan.defaultLang)
              const requesterName = `${created.name} ${created.lastName}`
              const planTitle =
                plan.title ??
                (lang === 'he'
                  ? '\u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e9\u05dc\u05da'
                  : 'your plan')
              const deepLink = `${config.frontendUrl}/plans/${planId}/join-requests`
              const msg = joinRequestMessage(lang, {
                requesterName,
                planTitle,
                deepLink,
              })
              fireAndForgetNotification({
                whatsapp: fastify.whatsapp,
                db: fastify.db,
                log: request.log,
                phone: owner.contactPhone,
                message: msg,
                planId,
                recipientParticipantId: plan.ownerParticipantId,
                type: 'join_request_pending',
              })
            })
            .catch((err) => {
              request.log.warn(
                { err, requestId: created.requestId },
                'WhatsApp join-request notification error'
              )
            })
        }

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
          dietaryMembers: created.dietaryMembers,
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

  fastify.patch<{
    Params: { planId: string; requestId: string }
    Body: { status: 'approved' | 'rejected' }
  }>(
    '/plans/:planId/join-requests/:requestId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Approve or reject a join request',
        description:
          'Owner or admin updates a pending join request. Approved requests create a new participant linked to the requester. Rejected requests update status only.',
        params: { $ref: 'JoinRequestActionParams#' },
        body: { $ref: 'UpdateJoinRequestStatusBody#' },
        response: {
          200: {
            description: 'Join request approved or rejected',
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
            description: 'Forbidden — only the plan owner can manage requests',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan or join request does not exist',
            $ref: 'ErrorResponse#',
          },
          409: {
            description: 'Conflict — request already approved or rejected',
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
      const { planId, requestId } = request.params
      const { status: newStatus } = request.body
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

        if (plan.createdByUserId !== userId) {
          request.log.warn(
            { planId, userId, requestId },
            'Join request action rejected — not owner'
          )
          return reply
            .status(403)
            .send({ message: 'Only the plan owner can manage join requests' })
        }

        const [joinRequest] = await fastify.db
          .select()
          .from(participantJoinRequests)
          .where(
            and(
              eq(participantJoinRequests.requestId, requestId),
              eq(participantJoinRequests.planId, planId)
            )
          )
          .limit(1)

        if (!joinRequest) {
          return reply.status(404).send({ message: 'Join request not found' })
        }

        if (joinRequest.status !== 'pending') {
          return reply.status(409).send({
            message: `Join request has already been ${joinRequest.status}`,
          })
        }

        if (newStatus === 'approved') {
          const participant = await addParticipantToPlan(fastify.db, {
            planId,
            userId: joinRequest.supabaseUserId,
            name: joinRequest.name,
            lastName: joinRequest.lastName,
            contactPhone: joinRequest.contactPhone,
            contactEmail: joinRequest.contactEmail,
            displayName: joinRequest.displayName,
            adultsCount: joinRequest.adultsCount,
            kidsCount: joinRequest.kidsCount,
            foodPreferences: joinRequest.foodPreferences,
            allergies: joinRequest.allergies,
            dietaryMembers: joinRequest.dietaryMembers,
            notes: joinRequest.notes,
            inviteStatus: 'accepted',
          })

          await fastify.db
            .update(participantJoinRequests)
            .set({ status: 'approved', updatedAt: new Date() })
            .where(eq(participantJoinRequests.requestId, requestId))

          const result = participant

          request.log.info(
            {
              planId,
              requestId,
              participantId: result.participantId,
              approvedUserId: joinRequest.supabaseUserId,
            },
            'Join request approved — participant created'
          )

          if (joinRequest.contactPhone) {
            const lang = resolveLanguage(plan.defaultLang)
            const planTitle =
              plan.title ?? (lang === 'he' ? 'התוכנית' : 'the plan')
            const deepLink = `${config.frontendUrl}/plans/${planId}`
            const msg = joinRequestApprovedMessage(lang, {
              planTitle,
              deepLink,
            })
            fireAndForgetNotification({
              whatsapp: fastify.whatsapp,
              db: fastify.db,
              log: request.log,
              phone: joinRequest.contactPhone,
              message: msg,
              planId,
              recipientParticipantId: result.participantId,
              type: 'join_request_approved',
            })
          }

          return reply.status(200).send(result)
        }

        const [updated] = await fastify.db
          .update(participantJoinRequests)
          .set({ status: 'rejected', updatedAt: new Date() })
          .where(eq(participantJoinRequests.requestId, requestId))
          .returning()

        request.log.info(
          { planId, requestId, rejectedUserId: joinRequest.supabaseUserId },
          'Join request rejected'
        )

        if (joinRequest.contactPhone) {
          const lang = resolveLanguage(plan.defaultLang)
          const planTitle =
            plan.title ?? (lang === 'he' ? 'התוכנית' : 'the plan')
          const msg = joinRequestRejectedMessage(lang, { planTitle })
          fireAndForgetNotification({
            whatsapp: fastify.whatsapp,
            db: fastify.db,
            log: request.log,
            phone: joinRequest.contactPhone,
            message: msg,
            planId,
            recipientParticipantId: null,
            type: 'join_request_rejected',
          })
        }

        return reply.status(200).send({
          requestId: updated.requestId,
          planId: updated.planId,
          supabaseUserId: updated.supabaseUserId,
          name: updated.name,
          lastName: updated.lastName,
          contactPhone: updated.contactPhone,
          contactEmail: updated.contactEmail,
          displayName: updated.displayName,
          adultsCount: updated.adultsCount,
          kidsCount: updated.kidsCount,
          foodPreferences: updated.foodPreferences,
          allergies: updated.allergies,
          dietaryMembers: updated.dietaryMembers,
          notes: updated.notes,
          status: updated.status,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        })
      } catch (error) {
        request.log.error(
          { err: error, planId, requestId, userId },
          'Failed to update join request'
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
          message: 'Failed to update join request',
        })
      }
    }
  )
}
