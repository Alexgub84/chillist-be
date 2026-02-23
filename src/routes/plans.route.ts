import { randomBytes } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { plans, participants, NewPlan } from '../db/schema.js'
import * as schema from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'

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
  visibility?: 'public' | 'unlisted' | 'private'
  location?: schema.Location | null
  startDate?: string | null
  endDate?: string | null
  tags?: string[] | null
}

export async function plansRoutes(fastify: FastifyInstance) {
  // [DEPRECATED] Old route — creates plan without owner. Remove after FE switches to POST /plans/with-owner.
  fastify.post<{ Body: NewPlan }>(
    '/plans',
    {
      schema: {
        tags: ['plans'],
        summary: '[DEPRECATED] Create a plan without owner',
        description:
          'Deprecated: Use POST /plans/with-owner instead. Creates a plan without an owner participant.',
        body: { $ref: 'CreatePlanBodyLegacy#' },
        response: {
          201: { $ref: 'Plan#' },
          400: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { startDate, endDate, ...rest } = request.body
        const values = {
          ...rest,
          ...(startDate && { startDate: new Date(String(startDate)) }),
          ...(endDate && { endDate: new Date(String(endDate)) }),
        }

        const [createdPlan] = await fastify.db
          .insert(plans)
          .values(values)
          .returning()

        request.log.info({ planId: createdPlan.planId }, 'Plan created')
        return reply.status(201).send(createdPlan)
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

  fastify.post<{ Body: CreatePlanWithOwnerBody }>(
    '/plans/with-owner',
    {
      schema: {
        tags: ['plans'],
        summary: '[NEW] Create a plan with owner participant',
        description:
          'Creates a plan and its owner participant in a single transaction. Returns the plan with participants[] and items[]. Replaces POST /plans for new FE integration.',
        body: { $ref: 'CreatePlanBody#' },
        response: {
          201: { $ref: 'PlanWithDetails#' },
          400: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
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

        const authenticatedUserId = request.user?.id ?? null

        const visibility =
          planFields.visibility ??
          (authenticatedUserId ? ('unlisted' as const) : ('public' as const))

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

          return {
            ...updatedPlan,
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
        summary: 'List all plans',
        description: 'Retrieve all plans ordered by creation date',
        response: {
          200: { $ref: 'PlanList#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      try {
        const allPlans = await fastify.db
          .select()
          .from(plans)
          .orderBy(plans.createdAt)

        request.log.info({ count: allPlans.length }, 'Plans retrieved')
        return allPlans
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

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId',
    {
      schema: {
        tags: ['plans'],
        summary: 'Get plan by ID (now includes participants)',
        description:
          'Retrieve a single plan by its ID with associated items and participants. Response now includes participants[] array alongside items[].',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'PlanWithDetails#' },
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
        const { allowed, plan: accessPlan } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user?.id
        )

        if (!allowed || !accessPlan) {
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const plan = await fastify.db.query.plans.findFirst({
          where: eq(schema.plans.planId, planId),
          with: {
            items: true,
            participants: true,
          },
        })

        request.log.info({ planId }, 'Plan retrieved')
        return plan
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
          200: { $ref: 'Plan#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
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
        return updatedPlan
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
          'Delete a plan by its ID. Cascade delete handles related items, participants, and assignments.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'DeletePlanResponse#' },
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

        await fastify.db.delete(plans).where(eq(plans.planId, planId))

        request.log.info({ planId }, 'Plan deleted')
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
