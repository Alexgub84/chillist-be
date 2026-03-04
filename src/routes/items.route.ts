import { FastifyInstance } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
import { items, ItemCategory, Unit, ItemStatus, Item } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { recordItemCreated, recordItemUpdated } from '../utils/item-changes.js'
import { resolveItemUnit, classifyDbError } from '../utils/item-helpers.js'
import {
  checkPlanExists,
  validateParticipant,
  batchValidateParticipants,
  applyAllParticipantsUpdate,
  createItemAssignedToAll,
} from '../services/item.service.js'
import { NotOwnerError } from '../services/all-participants-items.service.js'

interface CreateItemBody {
  name: string
  category: ItemCategory
  quantity: number
  status: ItemStatus
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
  assignedParticipantId?: string | null
  assignedToAll?: boolean
}

interface UpdateItemBody {
  name?: string
  category?: ItemCategory
  quantity?: number
  unit?: Unit
  status?: ItemStatus
  subcategory?: string | null
  notes?: string | null
  assignedParticipantId?: string | null
  assignedToAll?: boolean
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
          'Create a new item in the specified plan. Equipment items always use pcs as the unit. Food items require a unit. Send assignedToAll=true to assign to every participant.',
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
      const { category, unit, assignedParticipantId, assignedToAll, ...rest } =
        request.body

      const unitResult = resolveItemUnit(category, unit)
      if ('error' in unitResult) {
        return reply.status(400).send({ message: unitResult.error })
      }

      try {
        if (!(await checkPlanExists(fastify.db, planId))) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        if (assignedParticipantId) {
          const check = await validateParticipant(
            fastify.db,
            assignedParticipantId,
            planId
          )
          if (!check.valid) {
            return reply
              .status(400)
              .send({ message: check.message ?? 'Invalid participant' })
          }
        }

        const [createdItem] = await fastify.db
          .insert(items)
          .values({
            planId,
            category,
            unit: unitResult.unit,
            assignedParticipantId: assignedParticipantId ?? null,
            ...rest,
          })
          .returning()

        request.log.info(
          { itemId: createdItem.itemId, planId, assignedParticipantId },
          'Item created'
        )
        recordItemCreated(fastify.db, {
          itemId: createdItem.itemId,
          planId,
          snapshot: createdItem as unknown as Record<string, unknown>,
          changedByUserId: request.user?.id ?? null,
        })

        if (assignedToAll) {
          const group = await createItemAssignedToAll(
            fastify.db,
            createdItem.itemId,
            planId
          )
          if (group) {
            const refreshed = group.find((g) => g.itemId === createdItem.itemId)
            return reply.status(201).send(refreshed ?? group[0])
          }
        }

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
          'Update an existing item by its ID. Supports all-participants assignment: send assignedToAll=true to assign to all, assignedParticipantId=<uuid> to reassign from all to one, assignedParticipantId=null or assignedToAll=false to unassign all. Core field changes on all-participants items cascade to every copy; status changes apply only to the target item.',
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
      const { assignedToAll, ...fieldUpdates } = request.body

      if (
        Object.keys(fieldUpdates).length === 0 &&
        assignedToAll === undefined
      ) {
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

        const participantValidator = (pid: string) =>
          validateParticipant(fastify.db, pid, existingItem.planId)

        const allResult = await applyAllParticipantsUpdate(
          fastify.db,
          itemId,
          existingItem,
          assignedToAll,
          fieldUpdates,
          participantValidator
        )

        if (allResult) {
          request.log.info(
            { itemId, changes: Object.keys(fieldUpdates) },
            'Item updated (all-participants)'
          )
          return allResult.item
        }

        if (
          fieldUpdates.assignedParticipantId !== undefined &&
          fieldUpdates.assignedParticipantId !== null
        ) {
          const check = await validateParticipant(
            fastify.db,
            fieldUpdates.assignedParticipantId,
            existingItem.planId
          )
          if (!check.valid) {
            return reply.status(400).send({ message: check.message })
          }
        }

        const [updatedItem] = await fastify.db
          .update(items)
          .set({ ...fieldUpdates, updatedAt: new Date() })
          .where(eq(items.itemId, itemId))
          .returning()

        request.log.info(
          { itemId, changes: Object.keys(fieldUpdates) },
          'Item updated'
        )
        recordItemUpdated(fastify.db, {
          itemId,
          planId: existingItem.planId,
          existing: existingItem,
          updates: fieldUpdates,
          changedByUserId: request.user?.id ?? null,
        })
        return updatedItem
      } catch (error) {
        if (error instanceof NotOwnerError) {
          return reply.status(403).send({ message: error.message })
        }

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
          'Create multiple items at once. Each item is validated independently — valid items are created, invalid items are reported in the errors array. Supports assignedToAll per item (same logic as single-item POST).',
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
        if (!(await checkPlanExists(fastify.db, planId))) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const participantIds = [
          ...new Set(
            itemsToCreate
              .map((item) => item.assignedParticipantId)
              .filter((id): id is string => !!id)
          ),
        ]
        const participantMap = await batchValidateParticipants(
          fastify.db,
          participantIds
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
          assignedParticipantId: string | null
        }> = []
        const assignToAllIndices = new Set<number>()
        const errors: BulkItemError[] = []

        for (const item of itemsToCreate) {
          const {
            category,
            unit,
            assignedParticipantId,
            assignedToAll,
            ...rest
          } = item

          const unitResult = resolveItemUnit(category, unit)
          if ('error' in unitResult) {
            errors.push({ name: item.name, message: unitResult.error })
            continue
          }

          if (assignedParticipantId) {
            const pPlanId = participantMap.get(assignedParticipantId)
            if (!pPlanId) {
              errors.push({
                name: item.name,
                message: 'Participant not found',
              })
              continue
            }
            if (pPlanId !== planId) {
              errors.push({
                name: item.name,
                message: 'Participant does not belong to this plan',
              })
              continue
            }
          }

          if (assignedToAll) {
            assignToAllIndices.add(validValues.length)
          }

          validValues.push({
            planId,
            category,
            unit: unitResult.unit,
            assignedParticipantId: assignedParticipantId ?? null,
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

        const finalItems: Item[] = []
        for (let i = 0; i < createdItems.length; i++) {
          const created = createdItems[i]

          recordItemCreated(fastify.db, {
            itemId: created.itemId,
            planId,
            snapshot: created as unknown as Record<string, unknown>,
            changedByUserId: request.user?.id ?? null,
          })

          if (assignToAllIndices.has(i)) {
            try {
              const group = await createItemAssignedToAll(
                fastify.db,
                created.itemId,
                planId
              )
              if (group) {
                const refreshed = group.find((g) => g.itemId === created.itemId)
                finalItems.push(refreshed ?? group[0])
              } else {
                finalItems.push(created)
              }
            } catch (err) {
              errors.push({
                name: created.name,
                message:
                  err instanceof Error
                    ? err.message
                    : 'Failed to assign to all',
              })
              finalItems.push(created)
            }
          } else {
            finalItems.push(created)
          }
        }

        const statusCode = errors.length === 0 ? 200 : 207
        request.log.info(
          { planId, created: finalItems.length, failed: errors.length },
          'Bulk items created'
        )
        return reply.status(statusCode).send({ items: finalItems, errors })
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
          'Update multiple items at once. Each item is validated independently — valid items are updated, invalid items are reported in the errors array. Supports assignedToAll per item (same logic as single-item PATCH).',
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
        const itemIds = itemUpdates.map((entry) => entry.itemId)
        const existingItems = await fastify.db
          .select()
          .from(items)
          .where(inArray(items.itemId, itemIds))

        const itemMap = new Map(existingItems.map((i) => [i.itemId, i]))

        const participantIds = [
          ...new Set(
            itemUpdates
              .map((entry) => entry.assignedParticipantId)
              .filter((id): id is string => id !== undefined && id !== null)
          ),
        ]
        const participantMap = await batchValidateParticipants(
          fastify.db,
          participantIds
        )

        const updatedItems: Item[] = []
        const errors: BulkItemError[] = []

        for (const entry of itemUpdates) {
          const { itemId, assignedToAll, ...fieldUpdates } = entry
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

          if (
            Object.keys(fieldUpdates).length === 0 &&
            assignedToAll === undefined
          ) {
            errors.push({
              name: existing.name,
              message: 'No fields to update',
            })
            continue
          }

          const participantValidator = async (
            pid: string
          ): Promise<{ valid: boolean; message?: string }> => {
            const pPlanId = participantMap.get(pid)
            if (!pPlanId)
              return { valid: false, message: 'Participant not found' }
            if (pPlanId !== planId)
              return {
                valid: false,
                message: 'Participant does not belong to this plan',
              }
            return { valid: true }
          }

          try {
            const allResult = await applyAllParticipantsUpdate(
              fastify.db,
              itemId,
              existing,
              assignedToAll,
              fieldUpdates,
              participantValidator
            )

            if (allResult) {
              updatedItems.push(allResult.item)
              continue
            }
          } catch (err) {
            errors.push({
              name: existing.name,
              message:
                err instanceof Error ? err.message : 'Failed to update item',
            })
            continue
          }

          if (
            fieldUpdates.assignedParticipantId !== undefined &&
            fieldUpdates.assignedParticipantId !== null
          ) {
            const pPlanId = participantMap.get(
              fieldUpdates.assignedParticipantId
            )
            if (!pPlanId) {
              errors.push({
                name: existing.name,
                message: 'Participant not found',
              })
              continue
            }
            if (pPlanId !== planId) {
              errors.push({
                name: existing.name,
                message: 'Participant does not belong to this plan',
              })
              continue
            }
          }

          const [updatedItem] = await fastify.db
            .update(items)
            .set({ ...fieldUpdates, updatedAt: new Date() })
            .where(eq(items.itemId, itemId))
            .returning()

          updatedItems.push(updatedItem)
          recordItemUpdated(fastify.db, {
            itemId,
            planId: existing.planId,
            existing,
            updates: fieldUpdates,
            changedByUserId: request.user?.id ?? null,
          })
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
