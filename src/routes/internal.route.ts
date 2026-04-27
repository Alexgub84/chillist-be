import { randomBytes, randomUUID } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { eq, inArray, count, and, asc, or, isNull, gte, sql } from 'drizzle-orm'
import {
  resolveUserByPhone,
  resolveOwnerForInternalPlan,
  isAmbiguousPhoneLookup,
} from '../services/internal-auth.service.js'
import { bootstrapUsersPhoneIfNull } from '../services/phone-sync.js'
import { persistAssignments } from '../services/item.service.js'
import {
  validateItemIds,
  advanceItemStatusOnExpense,
} from '../services/expense.service.js'
import { getPlanTags } from '../services/plan-tags.service.js'
import { normalizePhone } from '../utils/phone.js'
import {
  plans,
  participants,
  items,
  participantExpenses,
} from '../db/schema.js'
import type { ItemCategory, ItemStatus, Location } from '../db/schema.js'

const INTERNAL_RATE_LIMIT = { max: 30, timeWindow: '1 minute' }

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

function parseOptionalIsoDate(
  raw: unknown
): { ok: true; value?: Date } | { ok: false } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true }
  }
  if (typeof raw !== 'string') {
    return { ok: false }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: true, value: new Date(`${raw}T00:00:00.000Z`) }
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    return { ok: false }
  }
  return { ok: true, value: d }
}

const RSVP_VALUES = ['pending', 'confirmed', 'not_sure'] as const

function participantFieldsFromOwnerPreferences(raw: unknown): {
  rsvpStatus?: (typeof RSVP_VALUES)[number]
  adultsCount?: number
  kidsCount?: number
  foodPreferences?: string | null
  allergies?: string | null
} {
  if (raw === null || raw === undefined) {
    return {}
  }
  if (typeof raw !== 'object' || raw === null) {
    return {}
  }
  const o = raw as Record<string, unknown>
  const out: {
    rsvpStatus?: (typeof RSVP_VALUES)[number]
    adultsCount?: number
    kidsCount?: number
    foodPreferences?: string | null
    allergies?: string | null
  } = {}
  if (
    typeof o.rsvpStatus === 'string' &&
    (RSVP_VALUES as readonly string[]).includes(o.rsvpStatus)
  ) {
    out.rsvpStatus = o.rsvpStatus as (typeof RSVP_VALUES)[number]
  }
  if (
    typeof o.adultsCount === 'number' &&
    Number.isInteger(o.adultsCount) &&
    o.adultsCount >= 0
  ) {
    out.adultsCount = o.adultsCount
  }
  if (
    typeof o.kidsCount === 'number' &&
    Number.isInteger(o.kidsCount) &&
    o.kidsCount >= 0
  ) {
    out.kidsCount = o.kidsCount
  }
  if (typeof o.foodPreferences === 'string') {
    out.foodPreferences = o.foodPreferences
  }
  if (typeof o.allergies === 'string') {
    out.allergies = o.allergies
  }
  return out
}

const COMPLETED_STATUSES: ItemStatus[] = ['packed', 'purchased']

function participantDisplayName(p: {
  displayName: string | null
  name: string
  lastName: string
}): string {
  const trimmed = p.displayName?.trim()
  if (trimmed) return trimmed
  return `${p.name} ${p.lastName}`.trim()
}

function mapInternalCategory(category: ItemCategory): 'gear' | 'food' {
  return category === 'food' ? 'food' : 'gear'
}

function chatbotItemStatus(
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>,
  myParticipantId: string
): 'done' | 'pending' {
  const entry = assignmentStatusList.find(
    (a) => a.participantId === myParticipantId
  )
  if (!entry) return 'pending'
  return COMPLETED_STATUSES.includes(entry.status) ? 'done' : 'pending'
}

function assigneeLabel(
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>,
  isAllParticipants: boolean,
  nameByParticipantId: Map<string, string>
): string | null {
  if (isAllParticipants || assignmentStatusList.length === 0) return null
  const labels = assignmentStatusList
    .map((a) => nameByParticipantId.get(a.participantId) ?? '')
    .filter(Boolean)
  if (labels.length === 0) return null
  return labels.join(', ')
}

function isItemCompleted(
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>
): boolean {
  return (
    assignmentStatusList.length > 0 &&
    assignmentStatusList.every((a) => COMPLETED_STATUSES.includes(a.status))
  )
}

export async function internalRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/auth/identify',
    {
      config: { rateLimit: INTERNAL_RATE_LIMIT },
      schema: {
        tags: ['internal'],
        summary: 'Resolve a WhatsApp phone number to a Chillist user',
        description:
          'Identifies a registered user by their phone number. Returns the Supabase userId and display name. Returns 404 if the phone is not linked to any registered Chillist account. Returns 409 if multiple users share the same phone (data integrity issue).',
        body: { $ref: 'IdentifyRequest#' },
        response: {
          200: {
            description:
              'Supabase user id and display name for the phone number',
            $ref: 'IdentifyResponse#',
          },
          401: {
            description: 'Missing or invalid x-service-key',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'No registered user linked to this phone number',
            $ref: 'ErrorResponse#',
          },
          409: {
            description:
              'Multiple users share this phone number — data must be deduplicated',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { phoneNumber } = request.body as { phoneNumber: string }
      const phonePrefix = normalizePhone(phoneNumber).slice(0, 4) + '***'

      request.log.info({ phonePrefix }, 'Identifying user by phone')

      const result = await resolveUserByPhone(
        fastify.db,
        phoneNumber,
        request.log
      )

      if (isAmbiguousPhoneLookup(result)) {
        return reply.code(409).send({
          message:
            'Multiple Chillist accounts share this phone number. Sign in with one account in the app or remove the duplicate phone from the other profile before using WhatsApp.',
        })
      }

      if (!result) {
        request.log.info({ phonePrefix }, 'User not found')
        return reply.code(404).send({ message: 'User not found' })
      }

      request.log.info({ phonePrefix }, 'User identified')
      return result
    }
  )

  fastify.get(
    '/plans',
    {
      schema: {
        tags: ['internal'],
        summary: 'List future or undated plans for the chatbot user',
        description:
          'Returns a chatbot-friendly summary of plans the user is a member of (owner, participant, or viewer) where startDate is null or startDate is at or after the current time (UTC). Plans with a start date in the past are omitted. Requires x-service-key and x-user-id headers. completedItemCount counts items where every assignment entry has status packed or purchased.',
        response: {
          200: {
            description: 'Plans the user belongs to with counts and roles',
            $ref: 'InternalPlansResponse#',
          },
          401: {
            description:
              'Missing x-user-id, invalid x-service-key, or user could not be resolved',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Unexpected error while loading plans',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const userPlans = await fastify.db
        .select({
          planId: plans.planId,
          title: plans.title,
          startDate: plans.startDate,
          role: participants.role,
        })
        .from(plans)
        .innerJoin(participants, eq(participants.planId, plans.planId))
        .where(
          and(
            eq(participants.userId, userId),
            or(isNull(plans.startDate), gte(plans.startDate, sql`now()`))
          )
        )
        .orderBy(plans.createdAt)

      if (userPlans.length === 0) {
        return { plans: [] }
      }

      const planIds = userPlans.map((p) => p.planId)

      const [participantCounts, planItems] = await Promise.all([
        fastify.db
          .select({ planId: participants.planId, total: count() })
          .from(participants)
          .where(inArray(participants.planId, planIds))
          .groupBy(participants.planId),
        fastify.db
          .select({
            planId: items.planId,
            assignmentStatusList: items.assignmentStatusList,
          })
          .from(items)
          .where(inArray(items.planId, planIds)),
      ])

      const participantCountByPlan = new Map(
        participantCounts.map((r) => [r.planId, r.total])
      )

      const itemsByPlan = new Map<
        string,
        Array<{ participantId: string; status: ItemStatus }>[]
      >()
      for (const item of planItems) {
        const existing = itemsByPlan.get(item.planId) ?? []
        existing.push(item.assignmentStatusList)
        itemsByPlan.set(item.planId, existing)
      }

      const result = userPlans.map((p) => {
        const planItemList = itemsByPlan.get(p.planId) ?? []
        return {
          id: p.planId,
          name: p.title,
          date: p.startDate ? p.startDate.toISOString() : null,
          role: p.role,
          participantCount: participantCountByPlan.get(p.planId) ?? 0,
          itemCount: planItemList.length,
          completedItemCount: planItemList.filter(isItemCompleted).length,
        }
      })

      request.log.info(
        { count: result.length, userId },
        'Internal plans retrieved'
      )
      return { plans: result }
    }
  )

  fastify.post(
    '/plans',
    {
      schema: {
        tags: ['internal'],
        summary: 'Create a plan for the user identified by x-user-id',
        description:
          'WhatsApp/chatbot: creates a plan owned by the user from `x-user-id`. Sends `x-service-key` + `x-user-id`. Owner name and phone are resolved server-side (users table, Supabase metadata, participant fallback). Body requires `title`; optional description, dates, tags, defaultLang, currency, estimated headcount, locationName, and `ownerPreferences` (RSVP, group size, dietary text for the owner participant).',
        body: { $ref: 'InternalCreatePlanBody#' },
        response: {
          201: {
            description:
              'Plan created; returns id, title as name, and start date.',
            $ref: 'InternalCreatePlanResponse#',
          },
          400: {
            description:
              'Validation error, invalid dates, or owner phone/name could not be resolved',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Missing or invalid x-service-key, or missing x-user-id',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Unexpected server error while creating the plan',
            $ref: 'ErrorResponse#',
          },
          503: {
            description: 'Database connection error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const owner = await resolveOwnerForInternalPlan(
        fastify.db,
        userId,
        request.log
      )
      if (!owner) {
        request.log.warn(
          { userId },
          'Internal create plan — cannot resolve owner phone'
        )
        return reply.code(400).send({
          message:
            'Cannot create plan: no phone on file for this user. Add a phone in the app profile first.',
        })
      }

      const body = request.body as Record<string, unknown>
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if (!title) {
        return reply.code(400).send({ message: 'title is required' })
      }

      const startParsed = parseOptionalIsoDate(body.startDate)
      const endParsed = parseOptionalIsoDate(body.endDate)
      if (!startParsed.ok || !endParsed.ok) {
        return reply.code(400).send({ message: 'Invalid startDate or endDate' })
      }

      const locationName =
        typeof body.locationName === 'string' ? body.locationName.trim() : ''
      let location: Location | null = null
      if (locationName) {
        location = { locationId: randomUUID(), name: locationName }
      }

      const tags = Array.isArray(body.tags)
        ? (body.tags.filter((t) => typeof t === 'string') as string[])
        : undefined

      try {
        const result = await fastify.db.transaction(async (tx) => {
          const planValues: Record<string, unknown> = {
            title,
            description:
              body.description === null || body.description === undefined
                ? undefined
                : String(body.description),
            visibility: 'invite_only' as const,
            createdByUserId: userId,
            ...(location && { location }),
            ...(startParsed.value && { startDate: startParsed.value }),
            ...(endParsed.value && { endDate: endParsed.value }),
            ...(tags !== undefined && { tags }),
            ...(typeof body.defaultLang === 'string' && {
              defaultLang: body.defaultLang,
            }),
            ...(typeof body.currency === 'string' && {
              currency: body.currency,
            }),
            ...(typeof body.estimatedAdults === 'number' &&
              Number.isInteger(body.estimatedAdults) &&
              body.estimatedAdults >= 0 && {
                estimatedAdults: body.estimatedAdults,
              }),
            ...(typeof body.estimatedKids === 'number' &&
              Number.isInteger(body.estimatedKids) &&
              body.estimatedKids >= 0 && {
                estimatedKids: body.estimatedKids,
              }),
          }

          const [createdPlan] = await tx
            .insert(plans)
            .values(planValues as typeof plans.$inferInsert)
            .returning()

          const ownerPreferenceFields = participantFieldsFromOwnerPreferences(
            body.ownerPreferences
          )

          const [ownerParticipant] = await tx
            .insert(participants)
            .values({
              planId: createdPlan.planId,
              userId,
              name: owner.name,
              lastName: owner.lastName,
              contactPhone: owner.contactPhone,
              displayName: owner.displayName ?? null,
              role: 'owner',
              inviteToken: generateInviteToken(),
              ...ownerPreferenceFields,
            })
            .returning()

          const [updatedPlan] = await tx
            .update(plans)
            .set({ ownerParticipantId: ownerParticipant.participantId })
            .where(eq(plans.planId, createdPlan.planId))
            .returning()

          await bootstrapUsersPhoneIfNull(
            tx,
            userId,
            normalizePhone(owner.contactPhone),
            request.log
          )

          return updatedPlan
        })

        request.log.info(
          { planId: result.planId, userId },
          'Internal plan created'
        )

        return reply.code(201).send({
          plan: {
            id: result.planId,
            name: result.title,
            date: result.startDate ? result.startDate.toISOString() : null,
          },
        })
      } catch (error) {
        request.log.error({ err: error }, 'Internal create plan failed')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply.code(503).send({
            message: 'Database connection error',
          })
        }

        return reply.code(500).send({
          message: 'Failed to create plan',
        })
      }
    }
  )

  fastify.get(
    '/plans/:planId',
    {
      schema: {
        tags: ['internal'],
        summary: 'Get full plan detail for chatbot',
        description:
          'Returns plan metadata, all participants, and all items with chatbot-facing fields. Requires x-service-key and x-user-id. Caller must be a participants row for this plan. Item status reflects the calling user only.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'Plan with participants and items',
            $ref: 'InternalPlanDetailResponse#',
          },
          401: {
            description: 'Missing x-user-id or invalid x-service-key',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'User is not a participant on this plan',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Plan not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Unexpected error while loading plan',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const { planId } = request.params as { planId: string }

      const [planRow] = await fastify.db
        .select({
          planId: plans.planId,
          title: plans.title,
          startDate: plans.startDate,
        })
        .from(plans)
        .where(eq(plans.planId, planId))
        .limit(1)

      if (!planRow) {
        request.log.warn({ planId }, 'Internal plan detail — plan not found')
        return reply.code(404).send({ message: 'Plan not found' })
      }

      const [callerParticipant] = await fastify.db
        .select({
          participantId: participants.participantId,
          role: participants.role,
        })
        .from(participants)
        .where(
          and(eq(participants.planId, planId), eq(participants.userId, userId))
        )
        .limit(1)

      if (!callerParticipant) {
        request.log.warn(
          { planId, userId },
          'Internal plan detail — user not a participant'
        )
        return reply
          .code(403)
          .send({ message: 'User is not a participant on this plan' })
      }

      const planParticipantRows = await fastify.db
        .select({
          participantId: participants.participantId,
          name: participants.name,
          lastName: participants.lastName,
          displayName: participants.displayName,
          role: participants.role,
        })
        .from(participants)
        .where(eq(participants.planId, planId))
        .orderBy(asc(participants.createdAt))

      const nameByParticipantId = new Map<string, string>()
      for (const p of planParticipantRows) {
        nameByParticipantId.set(p.participantId, participantDisplayName(p))
      }

      const itemRows = await fastify.db
        .select({
          itemId: items.itemId,
          name: items.name,
          category: items.category,
          isAllParticipants: items.isAllParticipants,
          assignmentStatusList: items.assignmentStatusList,
        })
        .from(items)
        .where(eq(items.planId, planId))
        .orderBy(asc(items.createdAt))

      const participantPayload = planParticipantRows.map((p) => ({
        id: p.participantId,
        name: participantDisplayName(p),
        role: p.role,
      }))

      const itemPayload = itemRows.map((row) => ({
        id: row.itemId,
        name: row.name,
        status: chatbotItemStatus(
          row.assignmentStatusList,
          callerParticipant.participantId
        ),
        assignee: assigneeLabel(
          row.assignmentStatusList,
          row.isAllParticipants,
          nameByParticipantId
        ),
        category: mapInternalCategory(row.category),
      }))

      request.log.info({ planId, userId }, 'Internal plan detail retrieved')

      return {
        plan: {
          id: planRow.planId,
          name: planRow.title,
          date: planRow.startDate ? planRow.startDate.toISOString() : null,
          role: callerParticipant.role,
          participants: participantPayload,
          items: itemPayload,
        },
      }
    }
  )

  fastify.patch(
    '/items/:itemId/status',
    {
      schema: {
        tags: ['internal'],
        summary: 'Upsert calling user item status',
        description:
          'Upserts the calling user entry in assignmentStatusList. done maps to purchased; pending maps to pending. Caller must be a participant on the item plan.',
        params: { $ref: 'ItemIdParam#' },
        body: { $ref: 'InternalUpdateItemStatusBody#' },
        response: {
          200: {
            description: 'Updated item id, name, and chatbot status',
            $ref: 'InternalUpdateItemStatusResponse#',
          },
          400: {
            description: 'Validation error',
            $ref: 'ErrorResponse#',
          },
          401: {
            description: 'Missing x-user-id or invalid x-service-key',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'User is not a participant on the item plan',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Item not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Unexpected error while updating item',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const { itemId } = request.params as { itemId: string }
      const { status: chatbotStatus } = request.body as {
        status: 'done' | 'pending'
      }

      const [itemRow] = await fastify.db
        .select({
          itemId: items.itemId,
          planId: items.planId,
          name: items.name,
          assignmentStatusList: items.assignmentStatusList,
          isAllParticipants: items.isAllParticipants,
        })
        .from(items)
        .where(eq(items.itemId, itemId))
        .limit(1)

      if (!itemRow) {
        request.log.warn({ itemId }, 'Internal item status — item not found')
        return reply.code(404).send({ message: 'Item not found' })
      }

      const [callerParticipant] = await fastify.db
        .select({ participantId: participants.participantId })
        .from(participants)
        .where(
          and(
            eq(participants.planId, itemRow.planId),
            eq(participants.userId, userId)
          )
        )
        .limit(1)

      if (!callerParticipant) {
        request.log.warn(
          { itemId, planId: itemRow.planId, userId },
          'Internal item status — user not a participant'
        )
        return reply
          .code(403)
          .send({ message: 'User is not a participant on this plan' })
      }

      const dbStatus: ItemStatus =
        chatbotStatus === 'done' ? 'purchased' : 'pending'

      const nextList = [...itemRow.assignmentStatusList]
      const idx = nextList.findIndex(
        (a) => a.participantId === callerParticipant.participantId
      )
      if (idx >= 0) {
        nextList[idx] = {
          participantId: callerParticipant.participantId,
          status: dbStatus,
        }
      } else {
        nextList.push({
          participantId: callerParticipant.participantId,
          status: dbStatus,
        })
      }

      await persistAssignments(
        fastify.db,
        itemId,
        nextList,
        itemRow.isAllParticipants
      )

      const responseStatus = chatbotItemStatus(
        nextList,
        callerParticipant.participantId
      )

      request.log.info(
        { itemId, userId, responseStatus },
        'Internal item status updated'
      )

      return {
        item: {
          id: itemRow.itemId,
          name: itemRow.name,
          status: responseStatus,
        },
      }
    }
  )

  fastify.post(
    '/plans/:planId/expenses',
    {
      schema: {
        tags: ['internal'],
        summary: 'Create plan expense for the user identified by x-user-id',
        description:
          'Chatbot/WhatsApp backend use: records a purchase for the end user on `planId`. Headers: `x-service-key` (service auth) and `x-user-id` (that user’s Supabase UUID). The server finds their `participantId` on this plan and inserts one row in `participant_expenses`. Response `201` body matches the public Expense model (amount as decimal string, `itemIds` array, etc.). If `itemIds` is non-empty, each ID must belong to this plan; linked items where this participant was `pending` move to `purchased`. Create-only — updating or attaching items later is done via `PATCH /api/expenses/:expenseId` with a user JWT, not via this internal API.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'InternalCreateExpenseBody#' },
        response: {
          201: {
            description:
              'Expense persisted. Use `expenseId` for correlation; `itemIds` reflects the request (or `[]`).',
            $ref: 'Expense#',
          },
          400: {
            description:
              'Validation failed — e.g. unknown item IDs, items from another plan, amount ≤ 0, or schema violation.',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Missing `x-user-id`, or `x-service-key` missing/invalid.',
            $ref: 'ErrorResponse#',
          },
          403: {
            description:
              '`x-user-id` does not correspond to a participant on this plan.',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: '`planId` does not exist.',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Server error while creating the expense.',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const { planId } = request.params as { planId: string }
      const { amount, description, itemIds } = request.body as {
        amount: number
        description?: string
        itemIds?: string[]
      }

      const [planRow] = await fastify.db
        .select({ planId: plans.planId })
        .from(plans)
        .where(eq(plans.planId, planId))
        .limit(1)

      if (!planRow) {
        request.log.warn({ planId }, 'Internal create expense — plan not found')
        return reply.code(404).send({ message: 'Plan not found' })
      }

      const [callerParticipant] = await fastify.db
        .select({ participantId: participants.participantId })
        .from(participants)
        .where(
          and(eq(participants.planId, planId), eq(participants.userId, userId))
        )
        .limit(1)

      if (!callerParticipant) {
        request.log.warn(
          { planId, userId },
          'Internal create expense — user not a participant'
        )
        return reply
          .code(403)
          .send({ message: 'User is not a participant on this plan' })
      }

      if (itemIds && itemIds.length > 0) {
        const validationError = await validateItemIds(
          fastify.db,
          itemIds,
          planId
        )
        if (validationError) {
          return reply.code(400).send({ message: validationError })
        }
      }

      const created = await fastify.db.transaction(async (tx) => {
        const [expense] = await tx
          .insert(participantExpenses)
          .values({
            participantId: callerParticipant.participantId,
            planId,
            amount: String(amount),
            description: description ?? null,
            itemIds: itemIds ?? [],
            createdByUserId: userId,
          })
          .returning()

        if (itemIds && itemIds.length > 0) {
          await advanceItemStatusOnExpense(
            tx,
            itemIds,
            planId,
            callerParticipant.participantId
          )
        }

        return expense
      })

      request.log.info(
        {
          expenseId: created.expenseId,
          planId,
          participantId: callerParticipant.participantId,
          userId,
        },
        'Internal expense created'
      )
      return reply.code(201).send(created)
    }
  )

  fastify.patch(
    '/expenses/:expenseId',
    {
      schema: {
        tags: ['internal'],
        summary:
          'Update an expense on behalf of the user identified by x-user-id',
        description:
          'Chatbot/WhatsApp backend use: updates an existing expense. Headers: `x-service-key` + `x-user-id`. The caller must be the participant the expense belongs to (resolved from `x-user-id`). Send only fields to change. `itemIds` replaces the full list; only newly added IDs advance from `pending` to `purchased`. At least one field must be provided.',
        params: { $ref: 'ExpenseIdParam#' },
        body: { $ref: 'InternalUpdateExpenseBody#' },
        response: {
          200: {
            description:
              'Updated expense. `itemIds` reflects the new list after replacement.',
            $ref: 'Expense#',
          },
          400: {
            description:
              'Validation failed — no fields provided, unknown item IDs, items from another plan, or amount ≤ 0.',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Missing `x-user-id`, or `x-service-key` missing/invalid.',
            $ref: 'ErrorResponse#',
          },
          403: {
            description:
              '`x-user-id` does not match the participant this expense belongs to.',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: '`expenseId` does not exist.',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Server error while updating the expense.',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.internalUserId
      if (!userId) {
        return reply.code(401).send({ message: 'x-user-id header required' })
      }

      const { expenseId } = request.params as { expenseId: string }
      const updates = request.body as {
        amount?: number
        description?: string | null
        itemIds?: string[]
      }

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ message: 'No fields to update' })
      }

      const [existing] = await fastify.db
        .select()
        .from(participantExpenses)
        .where(eq(participantExpenses.expenseId, expenseId))

      if (!existing) {
        request.log.warn(
          { expenseId },
          'Internal update expense — expense not found'
        )
        return reply.code(404).send({ message: 'Expense not found' })
      }

      const [expenseParticipant] = await fastify.db
        .select({
          participantId: participants.participantId,
          userId: participants.userId,
        })
        .from(participants)
        .where(eq(participants.participantId, existing.participantId))
        .limit(1)

      if (!expenseParticipant || expenseParticipant.userId !== userId) {
        request.log.warn(
          { expenseId, userId },
          'Internal update expense — not the expense participant'
        )
        return reply
          .code(403)
          .send({ message: 'You can only edit your own expenses' })
      }

      if (updates.itemIds !== undefined && updates.itemIds.length > 0) {
        const validationError = await validateItemIds(
          fastify.db,
          updates.itemIds,
          existing.planId
        )
        if (validationError) {
          return reply.code(400).send({ message: validationError })
        }
      }

      const setValues: Record<string, unknown> = { updatedAt: new Date() }
      if (updates.amount !== undefined) {
        setValues.amount = String(updates.amount)
      }
      if (updates.description !== undefined) {
        setValues.description = updates.description
      }
      if (updates.itemIds !== undefined) {
        setValues.itemIds = updates.itemIds
      }

      const updated = await fastify.db.transaction(async (tx) => {
        const [expense] = await tx
          .update(participantExpenses)
          .set(setValues)
          .where(eq(participantExpenses.expenseId, expenseId))
          .returning()

        if (updates.itemIds !== undefined) {
          const oldIds = new Set(existing.itemIds)
          const newlyAdded = updates.itemIds.filter((id) => !oldIds.has(id))
          if (newlyAdded.length > 0) {
            await advanceItemStatusOnExpense(
              tx,
              newlyAdded,
              existing.planId,
              existing.participantId
            )
          }
        }

        return expense
      })

      request.log.info(
        { expenseId, changes: Object.keys(updates) },
        'Internal expense updated'
      )
      return updated
    }
  )

  fastify.get(
    '/plan-tags',
    {
      config: { rateLimit: INTERNAL_RATE_LIMIT },
      schema: {
        tags: ['internal'],
        summary: 'Get plan tag taxonomy for chatbot',
        description:
          'Returns the full bundled plan tag JSON (same payload as public GET /plan-tags). Requires x-service-key only — no x-user-id. Served from a static versioned JSON file.',
        response: {
          200: {
            description: 'Full plan tag taxonomy',
            $ref: 'PlanTagsResponse#',
          },
          401: {
            description: 'Missing or invalid x-service-key',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Unexpected error while loading plan tags',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const tags = getPlanTags()
        request.log.info(
          { version: tags['version'] },
          'Internal plan tags retrieved'
        )
        return tags
      } catch (err) {
        request.log.error({ err }, 'Internal plan tags failed')
        return reply.code(500).send({ message: 'Failed to retrieve plan tags' })
      }
    }
  )
}
