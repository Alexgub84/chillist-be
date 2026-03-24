import { FastifyInstance } from 'fastify'
import { eq, and, inArray } from 'drizzle-orm'
import {
  items,
  participants,
  ItemCategory,
  Unit,
  Item,
  Assignment,
} from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { classifyDbError } from '../utils/item-helpers.js'
import {
  checkItemMutationAccess,
  createPlanItems,
  processItemUpdate,
  type BulkItemError,
} from '../services/item.service.js'
import { filterAssignmentForParticipant } from '../utils/assignment-helpers.js'
import {
  splitUpdatePayload,
  type CreateItemInput,
} from '../utils/item-mutation.js'

interface CreateItemBody {
  name: string
  category: ItemCategory
  quantity: number
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
  assignmentStatusList?: Assignment[]
  isAllParticipants?: boolean
}

interface UpdateItemBody {
  name?: string
  category?: ItemCategory
  quantity?: number
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
  assignmentStatusList?: Assignment[]
  isAllParticipants?: boolean
  unassign?: boolean
}

export async function itemsRoutes(fastify: FastifyInstance) {
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

  fastify.post<{ Params: { planId: string }; Body: CreateItemBody }>(
    '/plans/:planId/items',
    {
      schema: {
        tags: ['items'],
        summary: 'Add an item to a plan',
        description:
          'Create a new item. No top-level status field exists; status is tracked per participant in assignmentStatusList. Equipment items always use pcs. Assignment payload on create is owner/admin only: send full assignmentStatusList + isAllParticipants=true for assign-to-all, or subset list + isAllParticipants=false for normal assignment. Omit assignment fields to create unassigned item.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'CreateItemBody#' },
        response: {
          201: {
            description: 'Created item',
            $ref: 'Item#',
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
            description: 'Not found — plan or item does not exist',
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
        const access = await checkItemMutationAccess(
          fastify.db,
          planId,
          request.user
        )
        if (!access.allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const isOwner =
          access.participant?.role === 'owner' || !access.participant

        const result = await createPlanItems(fastify.db, {
          planId,
          inputs: [request.body as CreateItemInput],
          isOwner,
          changedBy: { userId: request.user?.id ?? null },
        })

        if (result.errors.length > 0) {
          return reply.status(400).send({ message: result.errors[0].message })
        }

        const createdItem = result.items[0]
        request.log.info({ itemId: createdItem.itemId, planId }, 'Item created')
        fastify.notifyItemChange(planId)

        return reply.status(201).send(createdItem)
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to create item')
        const classified = classifyDbError(error, 'Failed to create item')
        return reply
          .status(classified.statusCode)
          .send({ message: classified.message })
      }
    }
  )

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/items',
    {
      schema: {
        tags: ['items'],
        summary: 'List all items for a plan',
        description:
          'Retrieve all items belonging to a specific plan. Response filtering: owners see the full assignmentStatusList for each item; non-owners (participants) see only their own entry in assignmentStatusList. There is no top-level status field — check assignmentStatusList entries for per-participant status.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'List of items',
            $ref: 'ItemList#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan or item does not exist',
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
        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const planItems = await fastify.db
          .select()
          .from(items)
          .where(eq(items.planId, planId))
          .orderBy(items.createdAt)

        const [myParticipant] = request.user
          ? await fastify.db
              .select({
                participantId: participants.participantId,
                role: participants.role,
              })
              .from(participants)
              .where(
                and(
                  eq(participants.planId, planId),
                  eq(participants.userId, request.user.id)
                )
              )
              .limit(1)
          : [undefined]

        const isOwner = !myParticipant || myParticipant.role === 'owner'

        if (!isOwner) {
          for (const item of planItems) {
            item.assignmentStatusList = filterAssignmentForParticipant(
              item.assignmentStatusList as Assignment[],
              myParticipant.participantId
            )
          }
        }

        request.log.info(
          { planId, count: planItems.length },
          'Plan items retrieved'
        )
        return planItems
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to retrieve plan items'
        )
        const classified = classifyDbError(
          error,
          'Failed to retrieve plan items'
        )
        return reply
          .status(classified.statusCode)
          .send({ message: classified.message })
      }
    }
  )

  fastify.patch<{ Params: { itemId: string }; Body: UpdateItemBody }>(
    '/items/:itemId',
    {
      schema: {
        tags: ['items'],
        summary: 'Update an item',
        description:
          'Update an item. No top-level status field exists; use assignmentStatusList for per-participant status. Owner/admin: assignmentStatusList is treated as full desired list (replace semantics) and may update isAllParticipants. Non-owner: send only your own assignment entry to update status or self-assign, or send unassign=true to remove yourself. Response visibility: owner/admin sees full assignmentStatusList, non-owner sees only own entry.',
        params: { $ref: 'ItemIdParam#' },
        body: { $ref: 'UpdateItemBody#' },
        response: {
          200: {
            description: 'Updated item',
            $ref: 'Item#',
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
            description: 'Not found — plan or item does not exist',
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
      const { itemId } = request.params

      try {
        const [existingItem] = await fastify.db
          .select()
          .from(items)
          .where(eq(items.itemId, itemId))

        if (!existingItem) {
          return reply.status(404).send({ message: 'Item not found' })
        }

        const access = await checkItemMutationAccess(
          fastify.db,
          existingItem.planId,
          request.user
        )
        if (!access.allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const isOwner =
          access.participant?.role === 'owner' || !access.participant

        const parsed = splitUpdatePayload(request.body)
        const hasAssignmentFields =
          'error' in parsed ? false : parsed.hasAssignmentFields
        const fieldUpdateKeys =
          'error' in parsed ? [] : Object.keys(parsed.fieldUpdates)

        const result = await processItemUpdate(fastify.db, {
          existingItem,
          body: request.body,
          access,
          isOwner,
          guestParticipantId: null,
          changedByUserId: request.user?.id ?? null,
          changedByParticipantId: null,
        })

        if (!result.ok) {
          return reply.status(result.status).send({ message: result.message })
        }

        request.log.info(
          {
            itemId,
            fieldChanges: fieldUpdateKeys,
            assignmentChanged: hasAssignmentFields,
          },
          'Item updated'
        )
        fastify.notifyItemChange(existingItem.planId)
        return result.item
      } catch (error) {
        request.log.error({ err: error, itemId }, 'Failed to update item')
        const classified = classifyDbError(error, 'Failed to update item')
        return reply
          .status(classified.statusCode)
          .send({ message: classified.message })
      }
    }
  )

  fastify.post<{
    Params: { planId: string }
    Body: { items: CreateItemBody[] }
  }>(
    '/plans/:planId/items/bulk',
    {
      schema: {
        tags: ['items'],
        summary: 'Bulk create items in a plan',
        description:
          'Create multiple items at once. Each item is validated independently. No top-level status field — per-participant status lives in assignmentStatusList. Assignment fields (owner-only): send assignmentStatusList and isAllParticipants per item.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'BulkCreateItemBody#' },
        response: {
          200: {
            description: 'Bulk operation results — all succeeded',
            $ref: 'BulkItemResponse#',
          },
          207: {
            description:
              'Partial success — some items failed, check errors array',
            $ref: 'BulkItemResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan or item does not exist',
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
      const { items: itemsToCreate } = request.body

      try {
        const access = await checkItemMutationAccess(
          fastify.db,
          planId,
          request.user
        )
        if (!access.allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const isOwner =
          access.participant?.role === 'owner' || !access.participant

        const { items: createdItems, errors } = await createPlanItems(
          fastify.db,
          {
            planId,
            inputs: itemsToCreate as CreateItemInput[],
            isOwner,
            changedBy: { userId: request.user?.id ?? null },
          }
        )

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          { planId, created: createdItems.length, failed: errors.length },
          'Bulk items created'
        )
        if (createdItems.length > 0) {
          fastify.notifyItemChange(planId)
        }
        return reply.status(statusCode).send({ items: createdItems, errors })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to bulk create items')
        const classified = classifyDbError(error, 'Failed to bulk create items')
        return reply
          .status(classified.statusCode)
          .send({ message: classified.message })
      }
    }
  )

  fastify.patch<{
    Params: { planId: string }
    Body: { items: Array<{ itemId: string } & UpdateItemBody> }
  }>(
    '/plans/:planId/items/bulk',
    {
      schema: {
        tags: ['items'],
        summary: 'Bulk update items in a plan',
        description:
          'Update multiple items at once. Each item is validated independently. No top-level status field exists; use assignmentStatusList per item. Owner/admin uses full-list replace semantics and may set isAllParticipants. Non-owner sends only their own assignment entry per item (merge semantics) or unassign=true. Response for non-owners is filtered to their own assignment entries.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'BulkUpdateItemBody#' },
        response: {
          200: {
            description: 'Bulk operation results — all succeeded',
            $ref: 'BulkItemResponse#',
          },
          207: {
            description:
              'Partial success — some items failed, check errors array',
            $ref: 'BulkItemResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan or item does not exist',
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
      const { items: itemUpdates } = request.body

      try {
        const access = await checkItemMutationAccess(
          fastify.db,
          planId,
          request.user
        )
        if (!access.allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const isOwner =
          access.participant?.role === 'owner' || !access.participant
        const itemIds = itemUpdates.map((entry) => entry.itemId)
        const existingItems = await fastify.db
          .select()
          .from(items)
          .where(inArray(items.itemId, itemIds))

        const itemMap = new Map(existingItems.map((i) => [i.itemId, i]))

        const updatedItems: Item[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const { itemId, ...body } = entry
          const existing = itemMap.get(itemId)

          if (!existing) {
            errors.push({
              name: entry.name || itemId,
              message: 'Item not found',
            })
            continue
          }

          if (existing.planId !== planId) {
            errors.push({
              name: existing.name,
              message: 'Item does not belong to this plan',
            })
            continue
          }

          try {
            const result = await processItemUpdate(fastify.db, {
              existingItem: existing,
              body,
              access,
              isOwner,
              guestParticipantId: null,
              changedByUserId: request.user?.id ?? null,
              changedByParticipantId: null,
            })

            if (!result.ok) {
              errors.push({
                name: existing.name,
                message: result.message,
              })
              continue
            }
            updatedItems.push(result.item)
          } catch (err) {
            errors.push({
              name: existing.name,
              message:
                err instanceof Error ? err.message : 'Failed to update item',
            })
          }
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          { planId, updated: updatedItems.length, failed: errors.length },
          'Bulk items updated'
        )
        if (updatedItems.length > 0) {
          fastify.notifyItemChange(planId)
        }
        return reply.status(statusCode).send({ items: updatedItems, errors })
      } catch (error) {
        request.log.error({ err: error, planId }, 'Failed to bulk update items')
        const classified = classifyDbError(error, 'Failed to bulk update items')
        return reply
          .status(classified.statusCode)
          .send({ message: classified.message })
      }
    }
  )
}
