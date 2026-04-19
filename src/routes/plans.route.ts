import { randomBytes } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { eq, and, getTableColumns } from 'drizzle-orm'
import {
  plans,
  participants,
  participantJoinRequests,
  NewPlan,
  ItemQuantitySource,
} from '../db/schema.js'
import * as schema from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { isAdmin } from '../utils/admin.js'
import { withItemQuantitySourceDefault } from '../utils/plan.js'
import { syncParticipantFromJwt } from '../services/profile-sync.js'
import { bootstrapUsersPhoneIfNull } from '../services/phone-sync.js'
import { normalizePhone } from '../utils/phone.js'

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

interface OwnerBody {
  name: string
  lastName: string
  contactPhone: string
  displayName?: string
  avatarUrl?: string
  contactEmail?: string
}

interface ParticipantBody {
  name: string
  lastName: string
  contactPhone: string
  displayName?: string
  role?: 'participant' | 'viewer'
  avatarUrl?: string
  contactEmail?: string
}

interface CreatePlanWithOwnerBody
  extends Omit<NewPlan, 'planId' | 'ownerParticipantId'> {
  owner: OwnerBody
  participants?: ParticipantBody[]
}

interface UpdatePlanBody {
  title?: string
  description?: string | null
  status?: 'draft' | 'active' | 'archived'
  visibility?: 'public' | 'invite_only' | 'private'
  location?: schema.Location | null
  startDate?: string | null
  endDate?: string | null
  tags?: string[] | null
  defaultLang?: string | null
  currency?: string | null
  estimatedAdults?: number | null
  estimatedKids?: number | null
  itemQuantitySource?: ItemQuantitySource | null
}

export async function plansRoutes(fastify: FastifyInstance) {
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

  fastify.post<{ Body: CreatePlanWithOwnerBody }>(
    '/plans',
    {
      schema: {
        tags: ['plans'],
        summary: 'Create a plan with owner participant',
        description:
          'Creates a plan and its owner participant in a single transaction. Requires JWT. Returns the plan with participants[] and items[].',
        body: { $ref: 'CreatePlanBody#' },
        response: {
          201: {
            description:
              'Plan created successfully with owner and participants',
            $ref: 'PlanWithDetails#',
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
      try {
        const {
          owner,
          participants: participantsList,
          startDate,
          endDate,
          ...planFields
        } = request.body

        const authenticatedUserId = request.user!.id

        if (planFields.visibility === 'public') {
          return reply.status(400).send({
            message: 'Cannot create public plans. Use invite_only or private.',
          })
        }

        const visibility = planFields.visibility ?? ('invite_only' as const)

        const planValues = {
          ...planFields,
          visibility,
          createdByUserId: authenticatedUserId,
          ...(startDate && { startDate: new Date(String(startDate)) }),
          ...(endDate && { endDate: new Date(String(endDate)) }),
        }

        const result = await fastify.db.transaction(async (tx) => {
          const [createdPlan] = await tx
            .insert(plans)
            .values(planValues)
            .returning()

          const [ownerParticipant] = await tx
            .insert(participants)
            .values({
              planId: createdPlan.planId,
              userId: authenticatedUserId,
              name: owner.name,
              lastName: owner.lastName,
              contactPhone: owner.contactPhone,
              displayName: owner.displayName,
              role: 'owner',
              avatarUrl: owner.avatarUrl,
              contactEmail: owner.contactEmail,
              inviteToken: generateInviteToken(),
            })
            .returning()

          let createdParticipants: (typeof ownerParticipant)[] = []

          if (participantsList && participantsList.length > 0) {
            createdParticipants = await tx
              .insert(participants)
              .values(
                participantsList.map((p) => ({
                  planId: createdPlan.planId,
                  name: p.name,
                  lastName: p.lastName,
                  contactPhone: p.contactPhone,
                  displayName: p.displayName,
                  role: p.role ?? ('participant' as const),
                  avatarUrl: p.avatarUrl,
                  contactEmail: p.contactEmail,
                  inviteToken: generateInviteToken(),
                }))
              )
              .returning()
          }

          const [updatedPlan] = await tx
            .update(plans)
            .set({ ownerParticipantId: ownerParticipant.participantId })
            .where(eq(plans.planId, createdPlan.planId))
            .returning()

          await bootstrapUsersPhoneIfNull(
            tx,
            authenticatedUserId,
            normalizePhone(owner.contactPhone)
          )

          return {
            ...withItemQuantitySourceDefault(updatedPlan),
            participants: [ownerParticipant, ...createdParticipants],
            items: [],
          }
        })

        request.log.info({ planId: result.planId }, 'Plan created with owner')
        return reply.status(201).send(result)
      } catch (error) {
        request.log.error({ err: error }, 'Failed to create plan')

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
          message: 'Failed to create plan',
        })
      }
    }
  )

  fastify.get(
    '/plans',
    {
      schema: {
        tags: ['plans'],
        summary: 'List plans the user participates in',
        description:
          "Retrieve plans where the authenticated user is a participant (owner or member), ordered by creation date. Each plan includes myParticipantId and myRole for the caller's membership row (use for leave-plan without a second request)",
        response: {
          200: {
            description: 'List of plans owned by the authenticated user',
            $ref: 'PlanList#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
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
      try {
        const userId = request.user!.id

        const filteredPlans = await fastify.db
          .select({
            ...getTableColumns(plans),
            myParticipantId: participants.participantId,
            myRole: participants.role,
          })
          .from(plans)
          .innerJoin(participants, eq(participants.planId, plans.planId))
          .where(eq(participants.userId, userId))
          .orderBy(plans.createdAt)

        request.log.info(
          { count: filteredPlans.length, userId },
          'Plans retrieved'
        )
        return filteredPlans.map(withItemQuantitySourceDefault)
      } catch (error) {
        request.log.error({ err: error }, 'Failed to retrieve plans')

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
          message: 'Failed to retrieve plans',
        })
      }
    }
  )

  fastify.get(
    '/admin/plans',
    {
      schema: {
        tags: ['admin', 'plans'],
        summary: 'Admin: list all plans',
        description:
          'Returns all plans in the system. Admin only. JWT required.',
        response: {
          200: {
            description: 'List of all plans (admin only)',
            $ref: 'PlanList#',
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
      if (!isAdmin(request.user)) {
        return reply.status(403).send({
          message: 'Admin access required',
        })
      }

      try {
        const allPlans = await fastify.db
          .select()
          .from(plans)
          .orderBy(plans.createdAt)

        request.log.info(
          { count: allPlans.length },
          'Admin: all plans retrieved'
        )
        return allPlans.map(withItemQuantitySourceDefault)
      } catch (error) {
        request.log.error({ err: error }, 'Admin: failed to retrieve plans')

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
          message: 'Failed to retrieve plans',
        })
      }
    }
  )

  fastify.delete<{ Params: { planId: string } }>(
    '/admin/plans/:planId',
    {
      schema: {
        tags: ['admin', 'plans'],
        summary: 'Admin: delete any plan',
        description:
          'Delete any plan by its ID. Admin only. JWT required. Cascade delete handles related items, participants, and assignments.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'Plan deleted successfully',
            $ref: 'DeletePlanResponse#',
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
            description: 'Not found — plan does not exist',
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
      if (!isAdmin(request.user)) {
        return reply.status(403).send({
          message: 'Admin access required',
        })
      }

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

        await fastify.db.delete(plans).where(eq(plans.planId, planId))

        request.log.info(
          {
            planId,
            deletedBy: request.user!.id,
            isAdmin: true,
          },
          'Admin: plan deleted'
        )
        return reply.status(200).send({ ok: true })
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Admin: failed to delete plan'
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
          message: 'Failed to delete plan',
        })
      }
    }
  )

  fastify.get(
    '/plans/pending-requests',
    {
      schema: {
        tags: ['plans'],
        summary: 'List plans with pending join requests',
        description:
          'Returns minimal plan details (planId, title, dates, location) for plans where the user has a pending join request. JWT required.',
        response: {
          200: {
            description:
              'List of plans with pending join requests for the user',
            $ref: 'PendingJoinRequestPreviewList#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
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
      try {
        const userId = request.user!.id

        const pendingPlans = await fastify.db
          .select({
            planId: plans.planId,
            title: plans.title,
            startDate: plans.startDate,
            endDate: plans.endDate,
            location: plans.location,
          })
          .from(participantJoinRequests)
          .innerJoin(plans, eq(participantJoinRequests.planId, plans.planId))
          .where(
            and(
              eq(participantJoinRequests.supabaseUserId, userId),
              eq(participantJoinRequests.status, 'pending')
            )
          )

        request.log.info(
          { count: pendingPlans.length, userId },
          'Pending join request plans retrieved'
        )
        return pendingPlans
      } catch (error) {
        request.log.error(
          { err: error },
          'Failed to retrieve pending join request plans'
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
          message: 'Failed to retrieve pending join request plans',
        })
      }
    }
  )

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/preview',
    {
      schema: {
        tags: ['plans'],
        summary: 'Get plan preview',
        description:
          'Returns minimal plan info when user is authed but not a participant (needs to create join request). JWT required. 400 if already a participant.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'Plan preview for non-participant',
            $ref: 'PlanPreviewFields#',
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
            description:
              'Not found — plan does not exist or you do not have access',
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
        const [plan] = await fastify.db
          .select({
            title: plans.title,
            description: plans.description,
            location: plans.location,
            startDate: plans.startDate,
            endDate: plans.endDate,
          })
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
            message:
              'Already a participant. Use GET /plans/:planId for full plan.',
          })
        }

        return {
          title: plan.title,
          description: plan.description,
          location: plan.location,
          startDate: plan.startDate,
          endDate: plan.endDate,
        }
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to retrieve plan preview'
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
          message: 'Failed to retrieve plan preview',
        })
      }
    }
  )

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Get plan by ID',
        description:
          'Returns full plan for participants, or preview+joinRequest for non-participants. JWT required.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description:
              'Full plan for participants, or preview+joinRequest for non-participants',
            oneOf: [
              { $ref: 'PlanWithDetails#' },
              { $ref: 'PlanNotParticipantResponse#' },
            ],
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description:
              'Not found — plan does not exist or you do not have access',
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
        const plan = await fastify.db.query.plans.findFirst({
          where: eq(schema.plans.planId, planId),
          with: {
            items: true,
            participants: true,
          },
        })

        if (!plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (allowed) {
          const userId = request.user!.id
          const isOwner = plan.createdByUserId === userId

          const syncedParticipant = await syncParticipantFromJwt(
            fastify.db,
            planId,
            request.user!,
            request.log
          )

          let finalParticipants = plan.participants
          if (syncedParticipant) {
            finalParticipants = plan.participants.map((p) =>
              p.participantId === syncedParticipant.participantId
                ? syncedParticipant
                : p
            )
          }

          const safeParticipants = isOwner
            ? finalParticipants
            : finalParticipants.map((p) => ({ ...p, inviteToken: null }))

          const result: Record<string, unknown> = {
            ...withItemQuantitySourceDefault(plan),
            participants: safeParticipants,
          }

          if (isOwner) {
            const joinRequestsRows = await fastify.db
              .select()
              .from(participantJoinRequests)
              .where(eq(participantJoinRequests.planId, planId))
            result.joinRequests = joinRequestsRows.map((r) => ({
              requestId: r.requestId,
              planId: r.planId,
              supabaseUserId: r.supabaseUserId,
              name: r.name,
              lastName: r.lastName,
              contactPhone: r.contactPhone,
              contactEmail: r.contactEmail,
              displayName: r.displayName,
              adultsCount: r.adultsCount,
              kidsCount: r.kidsCount,
              foodPreferences: r.foodPreferences,
              allergies: r.allergies,
              notes: r.notes,
              status: r.status,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            }))
          }

          request.log.info({ planId, userId }, 'Plan retrieved')
          return result
        }

        const [joinRequestRow] = await fastify.db
          .select()
          .from(participantJoinRequests)
          .where(
            and(
              eq(participantJoinRequests.planId, planId),
              eq(participantJoinRequests.supabaseUserId, request.user!.id)
            )
          )
          .limit(1)

        const preview = {
          title: plan.title,
          description: plan.description,
          location: plan.location,
          startDate: plan.startDate,
          endDate: plan.endDate,
        }

        const joinRequest = joinRequestRow
          ? {
              requestId: joinRequestRow.requestId,
              planId: joinRequestRow.planId,
              supabaseUserId: joinRequestRow.supabaseUserId,
              name: joinRequestRow.name,
              lastName: joinRequestRow.lastName,
              contactPhone: joinRequestRow.contactPhone,
              contactEmail: joinRequestRow.contactEmail,
              displayName: joinRequestRow.displayName,
              adultsCount: joinRequestRow.adultsCount,
              kidsCount: joinRequestRow.kidsCount,
              foodPreferences: joinRequestRow.foodPreferences,
              allergies: joinRequestRow.allergies,
              notes: joinRequestRow.notes,
              status: joinRequestRow.status,
              createdAt: joinRequestRow.createdAt,
              updatedAt: joinRequestRow.updatedAt,
            }
          : null

        request.log.info(
          { planId, userId: request.user!.id },
          'Plan preview for non-participant'
        )
        return reply.status(200).send({
          status: 'not_participant',
          preview,
          joinRequest,
        })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to retrieve plan')

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
          message: 'Failed to retrieve plan',
        })
      }
    }
  )

  fastify.patch<{ Params: { planId: string }; Body: UpdatePlanBody }>(
    '/plans/:planId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Update a plan',
        description: 'Update an existing plan by its ID',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'UpdatePlanBody#' },
        response: {
          200: {
            description: 'Updated plan',
            $ref: 'Plan#',
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
            description:
              'Not found — plan does not exist or you do not have access',
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
      const updates = request.body

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          message: 'No fields to update',
        })
      }

      if (updates.visibility === 'public') {
        return reply.status(400).send({
          message:
            'Cannot set visibility to public. Use invite_only or private.',
        })
      }

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

        const { startDate, endDate, ...rest } = updates
        const values = {
          ...rest,
          ...(startDate !== undefined && {
            startDate: startDate ? new Date(String(startDate)) : null,
          }),
          ...(endDate !== undefined && {
            endDate: endDate ? new Date(String(endDate)) : null,
          }),
          updatedAt: new Date(),
        }

        const [updatedPlan] = await fastify.db
          .update(plans)
          .set(values)
          .where(eq(plans.planId, planId))
          .returning()

        request.log.info(
          { planId, changes: Object.keys(updates) },
          'Plan updated'
        )
        return withItemQuantitySourceDefault(updatedPlan)
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to update plan')

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
          message: 'Failed to update plan',
        })
      }
    }
  )

  fastify.delete<{ Params: { planId: string } }>(
    '/plans/:planId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Delete a plan',
        description:
          'Delete a plan by its ID. Requires JWT. Only the plan owner can delete. Cascade delete handles related items, participants, and assignments.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'Plan deleted successfully',
            $ref: 'DeletePlanResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description:
              'Not found — plan does not exist or you do not have access',
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
            createdByUserId: plans.createdByUserId,
          })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        if (existingPlan.createdByUserId !== request.user!.id) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        await fastify.db.delete(plans).where(eq(plans.planId, planId))

        request.log.info(
          {
            planId,
            deletedBy: request.user!.id,
          },
          'Plan deleted'
        )
        return reply.status(200).send({ ok: true })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to delete plan')

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
          message: 'Failed to delete plan',
        })
      }
    }
  )
}
