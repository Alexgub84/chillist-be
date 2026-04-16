import { FastifyInstance } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { participantExpenses, participants } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import {
  validateItemIds,
  advanceItemStatusOnExpense,
} from '../services/expense.service.js'

interface CreateExpenseBody {
  participantId: string
  amount: number
  description?: string
  itemIds?: string[]
}

interface UpdateExpenseBody {
  amount?: number
  description?: string | null
  itemIds?: string[]
}

export async function expensesRoutes(fastify: FastifyInstance) {
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

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/expenses',
    {
      schema: {
        tags: ['expenses'],
        summary: 'List all expenses for a plan with per-participant totals',
        description:
          'Returns every expense entry for the plan plus a summary array with the total amount per participant.',
        params: { $ref: 'PlanIdParam#' },
        response: {
          200: {
            description: 'Expenses list and per-participant summary',
            $ref: 'ExpensesResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Plan not found or access denied',
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
        const { allowed, plan } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed || !plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const expenses = await fastify.db
          .select()
          .from(participantExpenses)
          .where(eq(participantExpenses.planId, planId))
          .orderBy(participantExpenses.createdAt)

        const summaryRows = await fastify.db
          .select({
            participantId: participantExpenses.participantId,
            totalAmount: sql<string>`sum(${participantExpenses.amount})`,
          })
          .from(participantExpenses)
          .where(eq(participantExpenses.planId, planId))
          .groupBy(participantExpenses.participantId)

        const summary = summaryRows.map((row) => ({
          participantId: row.participantId,
          totalAmount: Number(row.totalAmount),
        }))

        request.log.info(
          { planId, count: expenses.length },
          'Plan expenses retrieved'
        )
        return { expenses, summary }
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to retrieve plan expenses'
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
          .send({ message: 'Failed to retrieve plan expenses' })
      }
    }
  )

  fastify.post<{ Params: { planId: string }; Body: CreateExpenseBody }>(
    '/plans/:planId/expenses',
    {
      schema: {
        tags: ['expenses'],
        summary: 'Add an expense to a plan',
        description:
          'Create a new expense entry for a participant. Owner/admin can add expenses for any participant; linked participants can only add expenses for themselves.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'CreateExpenseBody#' },
        response: {
          201: {
            description: 'Created expense',
            $ref: 'Expense#',
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
            description: 'Forbidden — insufficient permissions',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Plan or participant not found',
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
      const { participantId, amount, description, itemIds } = request.body
      const userId = request.user!.id

      try {
        const { allowed, plan } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed || !plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const [targetParticipant] = await fastify.db
          .select({
            participantId: participants.participantId,
            userId: participants.userId,
            planId: participants.planId,
          })
          .from(participants)
          .where(eq(participants.participantId, participantId))

        if (!targetParticipant || targetParticipant.planId !== planId) {
          return reply
            .status(404)
            .send({ message: 'Participant not found in this plan' })
        }

        const isOwner = plan.createdByUserId === userId
        const isSelf =
          targetParticipant.userId !== null &&
          targetParticipant.userId === userId

        if (!isOwner && !isSelf) {
          return reply
            .status(403)
            .send({ message: 'You can only add expenses for yourself' })
        }

        if (itemIds && itemIds.length > 0) {
          const validationError = await validateItemIds(
            fastify.db,
            itemIds,
            planId
          )
          if (validationError) {
            return reply.status(400).send({ message: validationError })
          }
        }

        const created = await fastify.db.transaction(async (tx) => {
          const [expense] = await tx
            .insert(participantExpenses)
            .values({
              participantId,
              planId,
              amount: String(amount),
              description: description ?? null,
              itemIds: itemIds ?? [],
              createdByUserId: userId,
            })
            .returning()

          if (itemIds && itemIds.length > 0) {
            await advanceItemStatusOnExpense(tx, itemIds, planId, participantId)
          }

          return expense
        })

        request.log.info(
          { expenseId: created.expenseId, planId, participantId },
          'Expense created'
        )
        return reply.status(201).send(created)
      } catch (error) {
        request.log.error(
          { err: error, planId, participantId },
          'Failed to create expense'
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

        return reply.status(500).send({ message: 'Failed to create expense' })
      }
    }
  )

  fastify.patch<{
    Params: { expenseId: string }
    Body: UpdateExpenseBody
  }>(
    '/expenses/:expenseId',
    {
      schema: {
        tags: ['expenses'],
        summary: 'Update an expense',
        description:
          'Update an existing expense. Owner/admin can update any expense; the participant it belongs to can update their own.',
        params: { $ref: 'ExpenseIdParam#' },
        body: { $ref: 'UpdateExpenseBody#' },
        response: {
          200: {
            description: 'Updated expense',
            $ref: 'Expense#',
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
            description: 'Forbidden — insufficient permissions',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Expense not found',
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
      const { expenseId } = request.params
      const updates = request.body
      const userId = request.user!.id

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

      try {
        const [existing] = await fastify.db
          .select()
          .from(participantExpenses)
          .where(eq(participantExpenses.expenseId, expenseId))

        if (!existing) {
          return reply.status(404).send({ message: 'Expense not found' })
        }

        const { allowed, plan } = await checkPlanAccess(
          fastify.db,
          existing.planId,
          request.user
        )

        if (!allowed || !plan) {
          return reply.status(404).send({ message: 'Expense not found' })
        }

        const isOwner = plan.createdByUserId === userId

        if (!isOwner) {
          const [expenseParticipant] = await fastify.db
            .select({ userId: participants.userId })
            .from(participants)
            .where(eq(participants.participantId, existing.participantId))

          const isExpenseParticipant =
            expenseParticipant?.userId !== null &&
            expenseParticipant?.userId === userId

          if (!isExpenseParticipant) {
            return reply
              .status(403)
              .send({ message: 'You can only edit your own expenses' })
          }
        }

        if (updates.itemIds !== undefined && updates.itemIds.length > 0) {
          const validationError = await validateItemIds(
            fastify.db,
            updates.itemIds,
            existing.planId
          )
          if (validationError) {
            return reply.status(400).send({ message: validationError })
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
          'Expense updated'
        )
        return updated
      } catch (error) {
        request.log.error({ err: error, expenseId }, 'Failed to update expense')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply
            .status(503)
            .send({ message: 'Database connection error' })
        }

        return reply.status(500).send({ message: 'Failed to update expense' })
      }
    }
  )

  fastify.delete<{ Params: { expenseId: string } }>(
    '/expenses/:expenseId',
    {
      schema: {
        tags: ['expenses'],
        summary: 'Delete an expense',
        description:
          'Delete an expense. Owner/admin can delete any expense; the participant it belongs to can delete their own.',
        params: { $ref: 'ExpenseIdParam#' },
        response: {
          200: {
            description: 'Expense deleted',
            $ref: 'DeleteExpenseResponse#',
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
            description: 'Expense not found',
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
      const { expenseId } = request.params
      const userId = request.user!.id

      try {
        const [existing] = await fastify.db
          .select({
            expenseId: participantExpenses.expenseId,
            participantId: participantExpenses.participantId,
            planId: participantExpenses.planId,
          })
          .from(participantExpenses)
          .where(eq(participantExpenses.expenseId, expenseId))

        if (!existing) {
          return reply.status(404).send({ message: 'Expense not found' })
        }

        const { allowed, plan } = await checkPlanAccess(
          fastify.db,
          existing.planId,
          request.user
        )

        if (!allowed || !plan) {
          return reply.status(404).send({ message: 'Expense not found' })
        }

        const isOwner = plan.createdByUserId === userId

        if (!isOwner) {
          const [expenseParticipant] = await fastify.db
            .select({ userId: participants.userId })
            .from(participants)
            .where(eq(participants.participantId, existing.participantId))

          const isExpenseParticipant =
            expenseParticipant?.userId !== null &&
            expenseParticipant?.userId === userId

          if (!isExpenseParticipant) {
            return reply
              .status(403)
              .send({ message: 'You can only delete your own expenses' })
          }
        }

        await fastify.db
          .delete(participantExpenses)
          .where(eq(participantExpenses.expenseId, expenseId))

        request.log.info({ expenseId }, 'Expense deleted')
        return reply.status(200).send({ ok: true })
      } catch (error) {
        request.log.error({ err: error, expenseId }, 'Failed to delete expense')

        const isConnectionError =
          error instanceof Error &&
          (error.message.includes('connect') ||
            error.message.includes('timeout'))

        if (isConnectionError) {
          return reply
            .status(503)
            .send({ message: 'Database connection error' })
        }

        return reply.status(500).send({ message: 'Failed to delete expense' })
      }
    }
  )
}
