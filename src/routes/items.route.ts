import { FastifyInstance } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
import {
  items,
  ItemCategory,
  Unit,
  ItemStatus,
  Item,
  Assignment,
} from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { recordItemCreated, recordItemUpdated } from '../utils/item-changes.js'
import {
  resolveItemUnit,
  resolveItemUnitForUpdate,
  classifyDbError,
} from '../utils/item-helpers.js'
import {
  checkItemMutationAccess,
  canEditItem,
  persistAssignments,
} from '../services/item.service.js'
import {
  resolveAssignments,
  validateParticipantAssignmentChange,
} from '../utils/assignment-helpers.js'

interface CreateItemBody {
  name: string
  category: ItemCategory
  quantity: number
  status: ItemStatus
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
  status?: ItemStatus
  subcategory?: string | null
  notes?: string | null
  assignmentStatusList?: Assignment[]
  isAllParticipants?: boolean
}

interface BulkItemError {
  name: string
  message: string
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
          'Create a new item in the specified plan. Equipment items always use pcs as the unit. Send assignmentStatusList and isAllParticipants to set assignments.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'CreateItemBody#' },
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
      const { planId } = request.params
      const {
        category,
        unit,
        assignmentStatusList: bodyAssignments,
        isAllParticipants: bodyIsAll,
        ...rest
      } = request.body

      const unitResult = resolveItemUnit(category, unit)
      if ('error' in unitResult) {
        return reply.status(400).send({ message: unitResult.error })
      }

      try {
        const access = await checkItemMutationAccess(
          fastify.db,
          planId,
          request.user
        )
        if (!access.allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const isOwner = access.participant?.role === 'owner'
        const hasAssignmentFields =
          bodyAssignments !== undefined || bodyIsAll !== undefined

        if (hasAssignmentFields && !isOwner) {
          return reply.status(400).send({
            message: 'Only the plan owner can set assignments on create',
          })
        }

        const resolved = resolveAssignments(bodyAssignments)

        const [createdItem] = await fastify.db
          .insert(items)
          .values({
            planId,
            category,
            unit: unitResult.unit,
            assignmentStatusList: resolved,
            isAllParticipants: bodyIsAll ?? false,
            ...rest,
          })
          .returning()

        request.log.info({ itemId: createdItem.itemId, planId }, 'Item created')
        recordItemCreated(fastify.db, {
          itemId: createdItem.itemId,
          planId,
          snapshot: createdItem as unknown as Record<string, unknown>,
          changedByUserId: request.user?.id ?? null,
        })

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
        description: 'Retrieve all items belonging to a specific plan',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: { $ref: 'ItemList#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
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
          'Update an existing item by its ID. Send the full desired assignmentStatusList and isAllParticipants. Non-owners may only change their own assignment entry.',
        params: { $ref: 'ItemIdParam#' },
        body: { $ref: 'UpdateItemBody#' },
        response: {
          200: { $ref: 'Item#' },
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const { itemId } = request.params
      const {
        assignmentStatusList: bodyAssignments,
        isAllParticipants: bodyIsAll,
        ...fieldUpdates
      } = request.body

      const hasAssignmentFields =
        bodyAssignments !== undefined || bodyIsAll !== undefined

      if (Object.keys(fieldUpdates).length === 0 && !hasAssignmentFields) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

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
          return reply.status(404).send({ message: 'Item not found' })
        }

        if (!canEditItem(access, existingItem)) {
          return reply.status(404).send({ message: 'Item not found' })
        }

        const isOwner = access.participant?.role === 'owner'

        if (hasAssignmentFields && !isOwner) {
          const incomingList =
            bodyAssignments ??
            (existingItem.assignmentStatusList as Assignment[])
          const incomingIsAll = bodyIsAll ?? existingItem.isAllParticipants

          const validation = validateParticipantAssignmentChange(
            existingItem.assignmentStatusList as Assignment[],
            existingItem.isAllParticipants,
            incomingList,
            incomingIsAll,
            access.participant!.participantId
          )
          if (!validation.valid) {
            return reply.status(400).send({ message: validation.message! })
          }
        }

        const unitResult = resolveItemUnitForUpdate(
          existingItem.category,
          existingItem.unit,
          fieldUpdates
        )
        if (unitResult && 'error' in unitResult) {
          return reply.status(400).send({ message: unitResult.error })
        }
        if (unitResult) {
          fieldUpdates.unit = unitResult.unit
        }

        let finalItem: Item = existingItem

        if (Object.keys(fieldUpdates).length > 0) {
          const [updated] = await fastify.db
            .update(items)
            .set({ ...fieldUpdates, updatedAt: new Date() })
            .where(eq(items.itemId, itemId))
            .returning()
          finalItem = updated
        }

        if (hasAssignmentFields) {
          const finalList =
            bodyAssignments !== undefined
              ? resolveAssignments(bodyAssignments)
              : (existingItem.assignmentStatusList as Assignment[])
          const finalIsAll = bodyIsAll ?? existingItem.isAllParticipants

          finalItem = await persistAssignments(
            fastify.db,
            itemId,
            finalList,
            finalIsAll
          )
        }

        request.log.info(
          { itemId, changes: Object.keys(request.body) },
          'Item updated'
        )
        recordItemUpdated(fastify.db, {
          itemId,
          planId: existingItem.planId,
          existing: existingItem,
          updates: fieldUpdates,
          changedByUserId: request.user?.id ?? null,
        })
        return finalItem
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
          'Create multiple items at once. Each item is validated independently. Send assignmentStatusList and isAllParticipants per item.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'BulkCreateItemBody#' },
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

        const isOwner = access.participant?.role === 'owner'

        const validValues: Array<{
          planId: string
          name: string
          category: ItemCategory
          quantity: number
          unit: Unit
          status: ItemStatus
          subcategory?: string | null
          notes?: string | null
          assignmentStatusList: Assignment[]
          isAllParticipants: boolean
        }> = []
        const errors: BulkItemError[] = []

        for (const item of itemsToCreate) {
          const {
            category,
            unit,
            assignmentStatusList: bodyAssignments,
            isAllParticipants: bodyIsAll,
            ...rest
          } = item

          const unitResult = resolveItemUnit(category, unit)
          if ('error' in unitResult) {
            errors.push({ name: item.name, message: unitResult.error })
            continue
          }

          const hasAssignmentFields =
            bodyAssignments !== undefined || bodyIsAll !== undefined

          if (hasAssignmentFields && !isOwner) {
            errors.push({
              name: item.name,
              message: 'Only the plan owner can set assignments on create',
            })
            continue
          }

          const resolved = resolveAssignments(bodyAssignments)

          validValues.push({
            planId,
            category,
            unit: unitResult.unit,
            assignmentStatusList: resolved,
            isAllParticipants: bodyIsAll ?? false,
            ...rest,
          })
        }

        let createdItems: Item[] = []
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
            changedByUserId: request.user?.id ?? null,
          })
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          { planId, created: createdItems.length, failed: errors.length },
          'Bulk items created'
        )
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
          'Update multiple items at once. Each item is validated independently. Send assignmentStatusList and isAllParticipants per item.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'BulkUpdateItemBody#' },
        response: {
          200: { $ref: 'BulkItemResponse#' },
          207: { $ref: 'BulkItemResponse#' },
          500: { $ref: 'ErrorResponse#' },
          503: { $ref: 'ErrorResponse#' },
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

        const isOwner = access.participant?.role === 'owner'
        const itemIds = itemUpdates.map((entry) => entry.itemId)
        const existingItems = await fastify.db
          .select()
          .from(items)
          .where(inArray(items.itemId, itemIds))

        const itemMap = new Map(existingItems.map((i) => [i.itemId, i]))

        const updatedItems: Item[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const {
            itemId,
            assignmentStatusList: bodyAssignments,
            isAllParticipants: bodyIsAll,
            ...fieldUpdates
          } = entry
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

          const hasAssignmentFields =
            bodyAssignments !== undefined || bodyIsAll !== undefined

          if (Object.keys(fieldUpdates).length === 0 && !hasAssignmentFields) {
            errors.push({
              name: existing.name,
              message: 'No fields to update',
            })
            continue
          }

          if (!canEditItem(access, existing)) {
            errors.push({
              name: existing.name,
              message: 'Item not found',
            })
            continue
          }

          if (hasAssignmentFields && !isOwner) {
            const incomingList =
              bodyAssignments ?? (existing.assignmentStatusList as Assignment[])
            const incomingIsAll = bodyIsAll ?? existing.isAllParticipants

            const validation = validateParticipantAssignmentChange(
              existing.assignmentStatusList as Assignment[],
              existing.isAllParticipants,
              incomingList,
              incomingIsAll,
              access.participant!.participantId
            )
            if (!validation.valid) {
              errors.push({
                name: existing.name,
                message: validation.message!,
              })
              continue
            }
          }

          const unitResult = resolveItemUnitForUpdate(
            existing.category,
            existing.unit,
            fieldUpdates
          )
          if (unitResult && 'error' in unitResult) {
            errors.push({
              name: existing.name,
              message: unitResult.error,
            })
            continue
          }
          if (unitResult) {
            fieldUpdates.unit = unitResult.unit
          }

          try {
            let finalItem: Item = existing

            if (Object.keys(fieldUpdates).length > 0) {
              const [updated] = await fastify.db
                .update(items)
                .set({ ...fieldUpdates, updatedAt: new Date() })
                .where(eq(items.itemId, itemId))
                .returning()
              finalItem = updated
            }

            if (hasAssignmentFields) {
              const finalList =
                bodyAssignments !== undefined
                  ? resolveAssignments(bodyAssignments)
                  : (existing.assignmentStatusList as Assignment[])
              const finalIsAll = bodyIsAll ?? existing.isAllParticipants

              finalItem = await persistAssignments(
                fastify.db,
                itemId,
                finalList,
                finalIsAll
              )
            }

            updatedItems.push(finalItem)
            recordItemUpdated(fastify.db, {
              itemId,
              planId: existing.planId,
              existing,
              updates: fieldUpdates,
              changedByUserId: request.user?.id ?? null,
            })
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
