import { FastifyInstance } from 'fastify'
import { eq, and, inArray } from 'drizzle-orm'
import {
  participants,
  items,
  plans,
  Unit,
  ItemCategory,
  ItemStatus,
} from '../db/schema.js'
import * as schema from '../db/schema.js'

interface BulkItemError {
  name: string
  message: string
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
          .select({
            participantId: participants.participantId,
            rsvpStatus: participants.rsvpStatus,
            adultsCount: participants.adultsCount,
            kidsCount: participants.kidsCount,
            foodPreferences: participants.foodPreferences,
            allergies: participants.allergies,
            notes: participants.notes,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Invite link rejected — invalid token'
          )
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
          request.log.warn({ planId }, 'Invite link rejected — plan not found')
          return reply.status(404).send({
            message: 'Plan not found',
          })
        }

        const filteredParticipants = plan.participants.map((p) => {
          let displayName = p.displayName
          if (!displayName || displayName.trim() === '') {
            const firstName = p.name || ''
            const lastInitial =
              p.lastName && p.lastName.length > 0 ? ` ${p.lastName[0]}.` : ''
            displayName = `${firstName}${lastInitial}`.trim()
          }
          return {
            participantId: p.participantId,
            displayName,
            role: p.role,
          }
        })

        const filteredItems = plan.items.filter(
          (item) =>
            !item.assignedParticipantId ||
            item.assignedParticipantId === participant.participantId
        )

        request.log.info(
          {
            planId,
            planTitle: plan.title,
            invitedParticipantId: participant.participantId,
            totalItems: plan.items.length,
            visibleItems: filteredItems.length,
          },
          'Guest accessed plan via invite link'
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
          myParticipantId: participant.participantId,
          myRsvpStatus: participant.rsvpStatus,
          myPreferences: {
            adultsCount: participant.adultsCount,
            kidsCount: participant.kidsCount,
            foodPreferences: participant.foodPreferences,
            allergies: participant.allergies,
            notes: participant.notes,
          },
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

  fastify.patch<{
    Params: { planId: string; inviteToken: string }
    Body: {
      displayName?: string | null
      adultsCount?: number | null
      kidsCount?: number | null
      foodPreferences?: string | null
      allergies?: string | null
      notes?: string | null
      rsvpStatus?: 'confirmed' | 'not_sure'
    }
  }>(
    '/plans/:planId/invite/:inviteToken/preferences',
    {
      schema: {
        tags: ['invite'],
        summary: 'Update guest preferences via invite token',
        description:
          'Allows a guest to update their per-plan preferences (display name, group size, dietary info) using the invite token in the URL. All fields are optional — send only what changed. Send null to clear a field.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'UpdateInvitePreferencesBody#' },
        response: {
          200: { $ref: 'InvitePreferencesResponse#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, inviteToken } = request.params
      const updates = request.body

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

      try {
        const [participant] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Invite preferences rejected — invalid token'
          )
          return reply
            .status(404)
            .send({ message: 'Invalid invite token or plan not found' })
        }

        const [updated] = await fastify.db
          .update(participants)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(participants.participantId, participant.participantId))
          .returning()

        request.log.info(
          {
            participantId: updated.participantId,
            planId,
            fields: Object.keys(updates),
          },
          'Guest preferences updated via invite token'
        )

        return {
          participantId: updated.participantId,
          displayName: updated.displayName,
          role: updated.role,
          rsvpStatus: updated.rsvpStatus,
          adultsCount: updated.adultsCount,
          kidsCount: updated.kidsCount,
          foodPreferences: updated.foodPreferences,
          allergies: updated.allergies,
          notes: updated.notes,
        }
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to update guest preferences'
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
          .send({ message: 'Failed to update preferences' })
      }
    }
  )

  fastify.post<{
    Params: { planId: string; inviteToken: string }
    Body: {
      name: string
      category: ItemCategory
      quantity: number
      unit?: Unit
      subcategory?: string | null
      notes?: string | null
    }
  }>(
    '/plans/:planId/invite/:inviteToken/items',
    {
      schema: {
        tags: ['invite'],
        summary: 'Create an item as a guest via invite token',
        description:
          'Creates a new item auto-assigned to the participant matched by the invite token. Equipment items default to pcs; food items require a unit.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'CreateInviteItemBody#' },
        response: {
          201: { $ref: 'Item#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, inviteToken } = request.params
      const { category, unit, ...rest } = request.body

      if (category === 'food' && !unit) {
        return reply
          .status(400)
          .send({ message: 'Unit is required for food items' })
      }

      const resolvedUnit = category === 'equipment' ? 'pcs' : unit!

      try {
        const [participant] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Guest item creation rejected — invalid token'
          )
          return reply
            .status(404)
            .send({ message: 'Invalid invite token or plan not found' })
        }

        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const [createdItem] = await fastify.db
          .insert(items)
          .values({
            planId,
            category,
            unit: resolvedUnit,
            assignedParticipantId: participant.participantId,
            ...rest,
          })
          .returning()

        request.log.info(
          {
            itemId: createdItem.itemId,
            planId,
            assignedParticipantId: participant.participantId,
          },
          'Guest created item via invite token'
        )
        return reply.status(201).send(createdItem)
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to create guest item')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply
            .status(503)
            .send({ message: 'Database connection error' })
        }

        return reply.status(500).send({ message: 'Failed to create item' })
      }
    }
  )

  fastify.patch<{
    Params: { planId: string; inviteToken: string; itemId: string }
    Body: {
      name?: string
      category?: ItemCategory
      quantity?: number
      unit?: Unit
      status?: ItemStatus
      subcategory?: string | null
      notes?: string | null
    }
  }>(
    '/plans/:planId/invite/:inviteToken/items/:itemId',
    {
      schema: {
        tags: ['invite'],
        summary: 'Update an item as a guest via invite token',
        description:
          'Updates an existing item. Allowed if the item is assigned to the participant matched by the invite token OR unassigned. Returns 403 if the item belongs to another participant.',
        params: { $ref: 'InviteItemParams#' },
        body: { $ref: 'UpdateInviteItemBody#' },
        response: {
          200: { $ref: 'Item#' },
          400: { $ref: 'ErrorResponse#' },
          403: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, inviteToken, itemId } = request.params
      const updates = request.body

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

      try {
        const [participant] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Guest item update rejected — invalid token'
          )
          return reply
            .status(404)
            .send({ message: 'Invalid invite token or plan not found' })
        }

        const [existingItem] = await fastify.db
          .select({
            itemId: items.itemId,
            planId: items.planId,
            assignedParticipantId: items.assignedParticipantId,
          })
          .from(items)
          .where(eq(items.itemId, itemId))

        if (!existingItem || existingItem.planId !== planId) {
          return reply.status(404).send({ message: 'Item not found' })
        }

        if (
          existingItem.assignedParticipantId !== null &&
          existingItem.assignedParticipantId !== participant.participantId
        ) {
          return reply
            .status(403)
            .send({ message: 'You can only edit items assigned to you' })
        }

        const [updatedItem] = await fastify.db
          .update(items)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(items.itemId, itemId))
          .returning()

        request.log.info(
          {
            itemId,
            planId,
            participantId: participant.participantId,
            changes: Object.keys(updates),
          },
          'Guest updated item via invite token'
        )
        return updatedItem
      } catch (error) {
        request.log.error(
          { err: error, planId, itemId },
          'Failed to update guest item'
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

        return reply.status(500).send({ message: 'Failed to update item' })
      }
    }
  )

  fastify.post<{
    Params: { planId: string; inviteToken: string }
    Body: {
      items: Array<{
        name: string
        category: ItemCategory
        quantity: number
        unit?: Unit
        subcategory?: string | null
        notes?: string | null
      }>
    }
  }>(
    '/plans/:planId/invite/:inviteToken/items/bulk',
    {
      schema: {
        tags: ['invite'],
        summary: 'Bulk create items as a guest via invite token',
        description:
          'Creates multiple items auto-assigned to the participant matched by the invite token. Each item is validated independently — valid items are created, invalid items are reported in the errors array.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'BulkCreateInviteItemBody#' },
        response: {
          200: { $ref: 'BulkItemResponse#' },
          207: { $ref: 'BulkItemResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, inviteToken } = request.params
      const { items: itemsToCreate } = request.body

      try {
        const [participant] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Guest bulk item creation rejected — invalid token'
          )
          return reply
            .status(404)
            .send({ message: 'Invalid invite token or plan not found' })
        }

        const [existingPlan] = await fastify.db
          .select({ planId: plans.planId })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!existingPlan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const validValues: Array<{
          planId: string
          name: string
          category: ItemCategory
          quantity: number
          unit: Unit
          subcategory?: string | null
          notes?: string | null
          assignedParticipantId: string
        }> = []
        const errors: BulkItemError[] = []

        for (const item of itemsToCreate) {
          const { category, unit, ...rest } = item

          if (category === 'food' && !unit) {
            errors.push({
              name: item.name,
              message: 'Unit is required for food items',
            })
            continue
          }

          const resolvedUnit = category === 'equipment' ? 'pcs' : unit!
          validValues.push({
            planId,
            category,
            unit: resolvedUnit,
            assignedParticipantId: participant.participantId,
            ...rest,
          })
        }

        let createdItems: (typeof items.$inferSelect)[] = []
        if (validValues.length > 0) {
          createdItems = await fastify.db
            .insert(items)
            .values(validValues)
            .returning()
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          {
            planId,
            participantId: participant.participantId,
            created: createdItems.length,
            failed: errors.length,
          },
          'Guest bulk items created via invite token'
        )
        return reply.status(statusCode).send({ items: createdItems, errors })
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to bulk create guest items'
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
          .send({ message: 'Failed to bulk create items' })
      }
    }
  )

  fastify.patch<{
    Params: { planId: string; inviteToken: string }
    Body: {
      items: Array<{
        itemId: string
        name?: string
        category?: ItemCategory
        quantity?: number
        unit?: Unit
        status?: ItemStatus
        subcategory?: string | null
        notes?: string | null
      }>
    }
  }>(
    '/plans/:planId/invite/:inviteToken/items/bulk',
    {
      schema: {
        tags: ['invite'],
        summary: 'Bulk update items as a guest via invite token',
        description:
          'Updates multiple items. Only allowed for items assigned to the participant matched by the invite token or unassigned items. Items assigned to other participants are reported in errors.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'BulkUpdateInviteItemBody#' },
        response: {
          200: { $ref: 'BulkItemResponse#' },
          207: { $ref: 'BulkItemResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { planId, inviteToken } = request.params
      const { items: itemUpdates } = request.body

      try {
        const [participant] = await fastify.db
          .select({
            participantId: participants.participantId,
            planId: participants.planId,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              eq(participants.inviteToken, inviteToken)
            )
          )

        if (!participant) {
          request.log.warn(
            { planId, inviteToken: inviteToken.slice(0, 8) + '...' },
            'Guest bulk item update rejected — invalid token'
          )
          return reply
            .status(404)
            .send({ message: 'Invalid invite token or plan not found' })
        }

        const itemIds = itemUpdates.map((entry) => entry.itemId)
        const existingItems = await fastify.db
          .select({
            itemId: items.itemId,
            planId: items.planId,
            name: items.name,
            assignedParticipantId: items.assignedParticipantId,
          })
          .from(items)
          .where(inArray(items.itemId, itemIds))

        const itemMap = new Map(existingItems.map((i) => [i.itemId, i]))

        const updatedItems: (typeof items.$inferSelect)[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const { itemId, ...updates } = entry
          const existing = itemMap.get(itemId)

          if (!existing || existing.planId !== planId) {
            errors.push({
              name: entry.name || itemId,
              message: 'Item not found',
            })
            continue
          }

          if (Object.keys(updates).length === 0) {
            errors.push({
              name: existing.name,
              message: 'No fields to update',
            })
            continue
          }

          if (
            existing.assignedParticipantId !== null &&
            existing.assignedParticipantId !== participant.participantId
          ) {
            errors.push({
              name: existing.name,
              message: 'You can only edit items assigned to you',
            })
            continue
          }

          const [updatedItem] = await fastify.db
            .update(items)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(items.itemId, itemId))
            .returning()

          updatedItems.push(updatedItem)
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          {
            planId,
            participantId: participant.participantId,
            updated: updatedItems.length,
            failed: errors.length,
          },
          'Guest bulk items updated via invite token'
        )
        return reply.status(statusCode).send({ items: updatedItems, errors })
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to bulk update guest items'
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
          .send({ message: 'Failed to bulk update items' })
      }
    }
  )
}
