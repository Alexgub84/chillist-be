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
  getPlanParticipantIds,
  persistAssignments,
} from '../services/item.service.js'
import { resolveAssignments } from '../utils/assignment-helpers.js'

interface CreateItemBody {
  name: string
  category: ItemCategory
  quantity: number
  status: ItemStatus
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
  assignmentStatusList?: Assignment[]
  assignToAll?: boolean
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
  assignToAll?: boolean
  forParticipantId?: string
  unassign?: boolean
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
          'Create a new item in the specified plan. Equipment items always use pcs as the unit. Send assignToAll=true to assign to every participant (owner only). Send assignmentStatusList to assign to specific participants.',
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
        assignToAll,
        ...rest
      } = request.body

      const unitResult = resolveItemUnit(category, unit)
      if ('error' in unitResult) {
        return reply.status(400).send({ message: unitResult.error })
      }

      if (assignToAll && bodyAssignments && bodyAssignments.length > 0) {
        return reply.status(400).send({
          message:
            'Cannot set both assignToAll and assignmentStatusList. Use one or the other.',
        })
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

        if (assignToAll && !isOwner) {
          return reply.status(400).send({
            message: 'Only the plan owner can assign items to all participants',
          })
        }

        if (bodyAssignments && bodyAssignments.length > 0 && !isOwner) {
          return reply.status(400).send({
            message: 'Only the plan owner can set assignments',
          })
        }

        const planParticipantIds = await getPlanParticipantIds(
          fastify.db,
          planId
        )

        const resolved = resolveAssignments({
          current: { assignmentStatusList: [], isAllParticipants: false },
          planParticipantIds,
          payload: {
            assignToAll,
            assignmentStatusList: bodyAssignments,
          },
        })

        const [createdItem] = await fastify.db
          .insert(items)
          .values({
            planId,
            category,
            unit: unitResult.unit,
            assignmentStatusList: resolved.assignmentStatusList,
            isAllParticipants: resolved.isAllParticipants,
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
          'Update an existing item by its ID. Owner can set assignmentStatusList or assignToAll. Non-owner can use forParticipantId to update own status or unassign self.',
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
        assignToAll,
        assignmentStatusList: bodyAssignments,
        forParticipantId,
        unassign,
        ...fieldUpdates
      } = request.body

      const hasAssignmentFields =
        assignToAll !== undefined ||
        bodyAssignments !== undefined ||
        forParticipantId !== undefined

      if (Object.keys(fieldUpdates).length === 0 && !hasAssignmentFields) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

      if (
        assignToAll !== undefined &&
        bodyAssignments !== undefined &&
        bodyAssignments.length > 0
      ) {
        return reply.status(400).send({
          message:
            'Cannot set both assignToAll and assignmentStatusList. Use one or the other.',
        })
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

        if (
          (assignToAll !== undefined || bodyAssignments !== undefined) &&
          !isOwner
        ) {
          return reply.status(400).send({
            message: 'Only the plan owner can modify assignments',
          })
        }

        if (forParticipantId && !isOwner) {
          if (forParticipantId !== access.participant?.participantId) {
            return reply.status(400).send({
              message: 'Non-owners can only update their own assignment',
            })
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
          const planParticipantIds = await getPlanParticipantIds(
            fastify.db,
            existingItem.planId
          )

          const resolved = resolveAssignments({
            current: {
              assignmentStatusList:
                finalItem.assignmentStatusList as Assignment[],
              isAllParticipants: finalItem.isAllParticipants,
            },
            planParticipantIds,
            payload: {
              assignToAll,
              assignmentStatusList: bodyAssignments,
              forParticipantId,
              unassign,
              status: fieldUpdates.status ?? request.body.status,
            },
          })

          finalItem = await persistAssignments(
            fastify.db,
            itemId,
            resolved.assignmentStatusList,
            resolved.isAllParticipants
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
          'Create multiple items at once. Each item is validated independently. Supports assignToAll per item (owner only).',
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
        const planParticipantIds = await getPlanParticipantIds(
          fastify.db,
          planId
        )

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
            assignToAll,
            ...rest
          } = item

          const unitResult = resolveItemUnit(category, unit)
          if ('error' in unitResult) {
            errors.push({ name: item.name, message: unitResult.error })
            continue
          }

          if (assignToAll && bodyAssignments && bodyAssignments.length > 0) {
            errors.push({
              name: item.name,
              message: 'Cannot set both assignToAll and assignmentStatusList',
            })
            continue
          }

          if (assignToAll && !isOwner) {
            errors.push({
              name: item.name,
              message:
                'Only the plan owner can assign items to all participants',
            })
            continue
          }

          if (bodyAssignments && bodyAssignments.length > 0 && !isOwner) {
            errors.push({
              name: item.name,
              message: 'Only the plan owner can set assignments',
            })
            continue
          }

          const resolved = resolveAssignments({
            current: { assignmentStatusList: [], isAllParticipants: false },
            planParticipantIds,
            payload: { assignToAll, assignmentStatusList: bodyAssignments },
          })

          validValues.push({
            planId,
            category,
            unit: unitResult.unit,
            assignmentStatusList: resolved.assignmentStatusList,
            isAllParticipants: resolved.isAllParticipants,
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
          'Update multiple items at once. Each item is validated independently. Supports assignToAll, assignmentStatusList, forParticipantId per item.',
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

        const planParticipantIds = await getPlanParticipantIds(
          fastify.db,
          planId
        )

        const updatedItems: Item[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const {
            itemId,
            assignToAll,
            assignmentStatusList: bodyAssignments,
            forParticipantId,
            unassign,
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
            assignToAll !== undefined ||
            bodyAssignments !== undefined ||
            forParticipantId !== undefined

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

          if (
            (assignToAll !== undefined || bodyAssignments !== undefined) &&
            !isOwner
          ) {
            errors.push({
              name: existing.name,
              message: 'Only the plan owner can modify assignments',
            })
            continue
          }

          if (forParticipantId && !isOwner) {
            if (forParticipantId !== access.participant?.participantId) {
              errors.push({
                name: existing.name,
                message: 'Non-owners can only update their own assignment',
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
              const resolved = resolveAssignments({
                current: {
                  assignmentStatusList:
                    finalItem.assignmentStatusList as Assignment[],
                  isAllParticipants: finalItem.isAllParticipants,
                },
                planParticipantIds,
                payload: {
                  assignToAll,
                  assignmentStatusList: bodyAssignments,
                  forParticipantId,
                  unassign,
                  status: fieldUpdates.status ?? entry.status,
                },
              })

              finalItem = await persistAssignments(
                fastify.db,
                itemId,
                resolved.assignmentStatusList,
                resolved.isAllParticipants
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
