import { FastifyInstance } from 'fastify'
import { eq, and, inArray } from 'drizzle-orm'
import {
  participants,
  items,
  plans,
  Unit,
  ItemCategory,
  Assignment,
} from '../db/schema.js'
import * as schema from '../db/schema.js'
import { recordItemCreated, recordItemUpdated } from '../utils/item-changes.js'
import { persistAssignments } from '../services/item.service.js'
import {
  mergeParticipantAssignment,
  filterAssignmentForParticipant,
  validateParticipantAssignmentChange,
} from '../utils/assignment-helpers.js'

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
          "Public endpoint. Validates the invite token and returns plan data with items. Items are filtered to only those assigned to the guest or unassigned. Each item's assignmentStatusList is filtered to show only the guest's own entry. Participant PII is stripped — only displayName and role are included. There is no top-level status on items — check assignmentStatusList for per-participant status.",
        params: { $ref: 'InviteParams#' },
        response: {
          200: {
            description: 'Plan and items returned for the invite token',
            $ref: 'InvitePlanResponse#',
          },
          404: {
            description: 'Not found — plan, item, or invite token is invalid',
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

        const filteredItems = plan.items
          .filter((item) => {
            const list = item.assignmentStatusList ?? []
            return (
              list.length === 0 ||
              list.some((a) => a.participantId === participant.participantId)
            )
          })
          .map((item) => ({
            ...item,
            assignmentStatusList: filterAssignmentForParticipant(
              (item.assignmentStatusList ?? []) as Assignment[],
              participant.participantId
            ),
          }))

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
          200: {
            description: 'Guest preferences updated',
            $ref: 'InvitePreferencesResponse#',
          },
          400: {
            description: 'Bad request — check the message field for details',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan, item, or invite token is invalid',
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
          'Creates a new item (no top-level status field). Equipment items default to pcs; food items require a unit. The item is not auto-assigned — send assignmentStatusList separately via PATCH if needed.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'CreateInviteItemBody#' },
        response: {
          201: {
            description: 'Item created',
            $ref: 'Item#',
          },
          400: {
            description: 'Bad request — check the message field for details',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan, item, or invite token is invalid',
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
            ...rest,
          })
          .returning()

        request.log.info(
          {
            itemId: createdItem.itemId,
            planId,
            createdByParticipantId: participant.participantId,
          },
          'Guest created item via invite token'
        )
        recordItemCreated(fastify.db, {
          itemId: createdItem.itemId,
          planId,
          snapshot: createdItem as unknown as Record<string, unknown>,
          changedByParticipantId: participant.participantId,
        })
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
      subcategory?: string | null
      notes?: string | null
      assignmentStatusList?: Assignment[]
      unassign?: boolean
    }
  }>(
    '/plans/:planId/invite/:inviteToken/items/:itemId',
    {
      schema: {
        tags: ['invite'],
        summary: 'Update an item as a guest via invite token',
        description:
          'Updates an existing item. Allowed if the item is assigned to the guest or unassigned. Returns 403 if assigned to a different participant. No top-level status field — to update your status, send assignmentStatusList with your own entry: [{ participantId: "your-id", status: "purchased" }]. Backend merges into the full list. Send unassign: true to remove yourself. Response returns assignmentStatusList filtered to only your entry.',
        params: { $ref: 'InviteItemParams#' },
        body: { $ref: 'UpdateInviteItemBody#' },
        response: {
          200: {
            description: 'Item updated',
            $ref: 'Item#',
          },
          400: {
            description: 'Bad request — check the message field for details',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'Forbidden — insufficient permissions',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan, item, or invite token is invalid',
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
      const { planId, inviteToken, itemId } = request.params
      const {
        assignmentStatusList: bodyAssignments,
        unassign,
        ...fieldUpdates
      } = request.body

      const hasAssignmentFields =
        bodyAssignments !== undefined || unassign === true

      if (Object.keys(fieldUpdates).length === 0 && !hasAssignmentFields) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

      if (unassign && bodyAssignments !== undefined) {
        return reply.status(400).send({
          message:
            'Cannot set both unassign and assignmentStatusList. Use one or the other.',
        })
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
          .select()
          .from(items)
          .where(eq(items.itemId, itemId))

        if (!existingItem || existingItem.planId !== planId) {
          return reply.status(404).send({ message: 'Item not found' })
        }

        const currentList = (existingItem.assignmentStatusList ??
          []) as Assignment[]
        const isAssignedToOthers =
          currentList.length > 0 &&
          !currentList.some(
            (a) => a.participantId === participant.participantId
          )
        if (isAssignedToOthers) {
          return reply
            .status(403)
            .send({ message: 'You can only edit items assigned to you' })
        }

        if (hasAssignmentFields && !unassign) {
          const validation = validateParticipantAssignmentChange(
            bodyAssignments ?? [],
            undefined,
            existingItem.isAllParticipants,
            participant.participantId
          )
          if (!validation.valid) {
            return reply.status(400).send({ message: validation.message! })
          }
        }

        let updatedItem = existingItem

        if (Object.keys(fieldUpdates).length > 0) {
          const [row] = await fastify.db
            .update(items)
            .set({ ...fieldUpdates, updatedAt: new Date() })
            .where(eq(items.itemId, itemId))
            .returning()
          updatedItem = row
        }

        if (hasAssignmentFields) {
          let mergedList: Assignment[]
          if (unassign) {
            mergedList = mergeParticipantAssignment(
              currentList,
              [],
              participant.participantId
            )
          } else {
            mergedList = mergeParticipantAssignment(
              currentList,
              bodyAssignments ?? []
            )
          }
          updatedItem = await persistAssignments(
            fastify.db,
            itemId,
            mergedList,
            existingItem.isAllParticipants
          )
        }

        updatedItem = {
          ...updatedItem,
          assignmentStatusList: filterAssignmentForParticipant(
            updatedItem.assignmentStatusList as Assignment[],
            participant.participantId
          ),
        }

        request.log.info(
          {
            itemId,
            planId,
            participantId: participant.participantId,
            fieldChanges: Object.keys(fieldUpdates),
            assignmentChanged: hasAssignmentFields,
          },
          'Guest updated item via invite token'
        )
        recordItemUpdated(fastify.db, {
          itemId,
          planId,
          existing: existingItem,
          updates: fieldUpdates,
          changedByParticipantId: participant.participantId,
        })
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
          'Creates multiple items (no top-level status field). Each item is validated independently — valid items are created, invalid items are reported in the errors array. Items are not auto-assigned.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'BulkCreateInviteItemBody#' },
        response: {
          200: {
            description: 'All items created successfully',
            $ref: 'BulkItemResponse#',
          },
          207: {
            description:
              'Partial success — some items created, some had validation errors',
            $ref: 'BulkItemResponse#',
          },
          404: {
            description: 'Not found — plan, item, or invite token is invalid',
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

        for (const created of createdItems) {
          recordItemCreated(fastify.db, {
            itemId: created.itemId,
            planId,
            snapshot: created as unknown as Record<string, unknown>,
            changedByParticipantId: participant.participantId,
          })
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
        subcategory?: string | null
        notes?: string | null
        assignmentStatusList?: Assignment[]
        unassign?: boolean
      }>
    }
  }>(
    '/plans/:planId/invite/:inviteToken/items/bulk',
    {
      schema: {
        tags: ['invite'],
        summary: 'Bulk update items as a guest via invite token',
        description:
          'Updates multiple items. No top-level status field — to update your status per item, send assignmentStatusList with your own entry: [{ participantId: "your-id", status: "purchased" }]. Backend merges into the full list for each item. Only allowed for items assigned to the guest or unassigned. Response returns each item\'s assignmentStatusList filtered to only your entry.',
        params: { $ref: 'InviteParams#' },
        body: { $ref: 'BulkUpdateInviteItemBody#' },
        response: {
          200: {
            description: 'All items updated successfully',
            $ref: 'BulkItemResponse#',
          },
          207: {
            description:
              'Partial success — some items updated, some had validation or permission errors',
            $ref: 'BulkItemResponse#',
          },
          404: {
            description: 'Not found — plan, item, or invite token is invalid',
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
          .select()
          .from(items)
          .where(inArray(items.itemId, itemIds))

        const itemMap = new Map(existingItems.map((i) => [i.itemId, i]))

        const updatedItems: (typeof items.$inferSelect)[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const {
            itemId,
            assignmentStatusList: bodyAssignments,
            unassign,
            ...fieldUpdates
          } = entry
          const existing = itemMap.get(itemId)

          if (!existing || existing.planId !== planId) {
            errors.push({
              name: entry.name || itemId,
              message: 'Item not found',
            })
            continue
          }

          const hasAssignmentFields =
            bodyAssignments !== undefined || unassign === true

          if (Object.keys(fieldUpdates).length === 0 && !hasAssignmentFields) {
            errors.push({
              name: existing.name,
              message: 'No fields to update',
            })
            continue
          }

          if (unassign && bodyAssignments !== undefined) {
            errors.push({
              name: existing.name,
              message:
                'Cannot set both unassign and assignmentStatusList. Use one or the other.',
            })
            continue
          }

          const currentList = (existing.assignmentStatusList ??
            []) as Assignment[]
          const isAssignedToOthers =
            currentList.length > 0 &&
            !currentList.some(
              (a) => a.participantId === participant.participantId
            )
          if (isAssignedToOthers) {
            errors.push({
              name: existing.name,
              message: 'You can only edit items assigned to you',
            })
            continue
          }

          if (hasAssignmentFields && !unassign) {
            const validation = validateParticipantAssignmentChange(
              bodyAssignments ?? [],
              undefined,
              existing.isAllParticipants,
              participant.participantId
            )
            if (!validation.valid) {
              errors.push({
                name: existing.name,
                message: validation.message!,
              })
              continue
            }
          }

          let updatedItem = existing

          if (Object.keys(fieldUpdates).length > 0) {
            const [row] = await fastify.db
              .update(items)
              .set({ ...fieldUpdates, updatedAt: new Date() })
              .where(eq(items.itemId, itemId))
              .returning()
            updatedItem = row
          }

          if (hasAssignmentFields) {
            let mergedList: Assignment[]
            if (unassign) {
              mergedList = mergeParticipantAssignment(
                currentList,
                [],
                participant.participantId
              )
            } else {
              mergedList = mergeParticipantAssignment(
                currentList,
                bodyAssignments ?? []
              )
            }
            updatedItem = await persistAssignments(
              fastify.db,
              itemId,
              mergedList,
              existing.isAllParticipants
            )
          }

          updatedItem = {
            ...updatedItem,
            assignmentStatusList: filterAssignmentForParticipant(
              updatedItem.assignmentStatusList as Assignment[],
              participant.participantId
            ),
          }

          updatedItems.push(updatedItem)
          recordItemUpdated(fastify.db, {
            itemId,
            planId: existing.planId,
            existing,
            updates: fieldUpdates,
            changedByParticipantId: participant.participantId,
          })
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
