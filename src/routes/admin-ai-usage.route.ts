import { FastifyInstance } from 'fastify'
import { and, eq, gte, lte, sql, count, sum, desc } from 'drizzle-orm'
import { aiUsageLogs } from '../db/schema.js'
import { isAdmin } from '../utils/admin.js'
import type { SQL } from 'drizzle-orm'

interface AiUsageQuery {
  planId?: string
  userId?: string
  featureType?: string
  status?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export async function adminAiUsageRoutes(fastify: FastifyInstance) {
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

  fastify.get<{ Querystring: AiUsageQuery }>(
    '/admin/ai-usage',
    {
      schema: {
        tags: ['admin'],
        summary: 'Admin: list AI usage logs with summary',
        description:
          'Returns paginated AI usage logs with optional filters and aggregated summary totals. Admin only. JWT required.',
        querystring: { $ref: 'AiUsageQuery#' },
        response: {
          200: {
            description: 'AI usage logs with summary',
            $ref: 'AiUsageResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          403: {
            description: 'Forbidden — admin access required',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send({ message: 'Admin access required' })
      }

      const {
        planId,
        userId,
        featureType,
        status,
        from,
        to,
        limit = 50,
        offset = 0,
      } = request.query

      try {
        const conditions: SQL[] = []

        if (planId) {
          conditions.push(eq(aiUsageLogs.planId, planId))
        }
        if (userId) {
          conditions.push(eq(aiUsageLogs.userId, userId))
        }
        if (featureType) {
          conditions.push(sql`${aiUsageLogs.featureType} = ${featureType}`)
        }
        if (status) {
          conditions.push(sql`${aiUsageLogs.status} = ${status}`)
        }
        if (from) {
          conditions.push(gte(aiUsageLogs.createdAt, new Date(from)))
        }
        if (to) {
          conditions.push(lte(aiUsageLogs.createdAt, new Date(to)))
        }

        const whereClause =
          conditions.length > 0 ? and(...conditions) : undefined

        const [logs, totalResult, overallSummary, byFeature, byModel] =
          await Promise.all([
            fastify.db
              .select()
              .from(aiUsageLogs)
              .where(whereClause)
              .orderBy(desc(aiUsageLogs.createdAt))
              .limit(limit)
              .offset(offset),

            fastify.db
              .select({ count: count() })
              .from(aiUsageLogs)
              .where(whereClause),

            fastify.db
              .select({
                totalRequests: count(),
                totalInputTokens: sum(aiUsageLogs.inputTokens),
                totalOutputTokens: sum(aiUsageLogs.outputTokens),
                totalEstimatedCost: sum(aiUsageLogs.estimatedCost),
              })
              .from(aiUsageLogs)
              .where(whereClause),

            fastify.db
              .select({
                featureType: aiUsageLogs.featureType,
                count: count(),
                totalCost: sum(aiUsageLogs.estimatedCost),
              })
              .from(aiUsageLogs)
              .where(whereClause)
              .groupBy(aiUsageLogs.featureType),

            fastify.db
              .select({
                modelId: aiUsageLogs.modelId,
                count: count(),
                totalCost: sum(aiUsageLogs.estimatedCost),
              })
              .from(aiUsageLogs)
              .where(whereClause)
              .groupBy(aiUsageLogs.modelId),
          ])

        const totals = overallSummary[0]

        request.log.info(
          { total: totalResult[0].count, limit, offset },
          'Admin: AI usage logs retrieved'
        )

        return {
          logs,
          total: totalResult[0].count,
          summary: {
            totalRequests: totals?.totalRequests ?? 0,
            totalInputTokens: Number(totals?.totalInputTokens ?? 0),
            totalOutputTokens: Number(totals?.totalOutputTokens ?? 0),
            totalEstimatedCost: totals?.totalEstimatedCost
              ? Number(totals.totalEstimatedCost)
              : null,
            byFeature: byFeature.map((row) => ({
              featureType: row.featureType,
              count: row.count,
              totalCost: row.totalCost ? Number(row.totalCost) : null,
            })),
            byModel: byModel.map((row) => ({
              modelId: row.modelId,
              count: row.count,
              totalCost: row.totalCost ? Number(row.totalCost) : null,
            })),
          },
        }
      } catch (error) {
        request.log.error(
          { err: error },
          'Admin: failed to retrieve AI usage logs'
        )

        return reply.status(500).send({
          message: 'Failed to retrieve AI usage logs',
        })
      }
    }
  )
}
