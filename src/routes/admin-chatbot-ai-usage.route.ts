import { FastifyInstance } from 'fastify'
import { and, eq, gte, lte, sql, count, sum, desc } from 'drizzle-orm'
import { chatbotAiUsage } from '../db/schema.js'
import { isAdmin } from '../utils/admin.js'
import type { SQL } from 'drizzle-orm'

interface ChatbotAiUsageQuery {
  userId?: string
  sessionId?: string
  chatType?: string
  status?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

function buildFilterSqlParts(query: ChatbotAiUsageQuery): SQL[] {
  const { userId, sessionId, chatType, status, from, to } = query
  const parts: SQL[] = []
  if (userId) {
    parts.push(sql`user_id = ${userId}`)
  }
  if (sessionId) {
    parts.push(sql`session_id = ${sessionId}`)
  }
  if (chatType) {
    parts.push(sql`chat_type = ${chatType}`)
  }
  if (status) {
    parts.push(sql`status = ${status}`)
  }
  if (from) {
    parts.push(sql`created_at >= ${new Date(from).toISOString()}`)
  }
  if (to) {
    parts.push(sql`created_at <= ${new Date(to).toISOString()}`)
  }
  return parts
}

export async function adminChatbotAiUsageRoutes(fastify: FastifyInstance) {
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

  fastify.get<{ Querystring: ChatbotAiUsageQuery }>(
    '/admin/chatbot-ai-usage',
    {
      schema: {
        tags: ['admin'],
        summary: 'Admin: list chatbot AI usage with summary',
        description:
          'Returns paginated rows from chatbot_ai_usage (newest first), total count for pagination, and aggregates including per-model, per-chat-type, and per-tool-name counts. The underlying table is written by the chatbot service; this route is read-only. Requires admin JWT.',
        querystring: { $ref: 'ChatbotAiUsageQuery#' },
        response: {
          200: {
            description:
              'Paginated logs, total count for filters, and summary aggregates',
            $ref: 'ChatbotAiUsageResponse#',
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
        userId,
        sessionId,
        chatType,
        status,
        from,
        to,
        limit = 50,
        offset = 0,
      } = request.query

      try {
        const conditions: SQL[] = []

        if (userId) {
          conditions.push(eq(chatbotAiUsage.userId, userId))
        }
        if (sessionId) {
          conditions.push(eq(chatbotAiUsage.sessionId, sessionId))
        }
        if (chatType) {
          conditions.push(eq(chatbotAiUsage.chatType, chatType))
        }
        if (status) {
          conditions.push(eq(chatbotAiUsage.status, status))
        }
        if (from) {
          conditions.push(gte(chatbotAiUsage.createdAt, new Date(from)))
        }
        if (to) {
          conditions.push(lte(chatbotAiUsage.createdAt, new Date(to)))
        }

        const whereClause =
          conditions.length > 0 ? and(...conditions) : undefined

        const filterSqlParts = buildFilterSqlParts(request.query)
        const innerWhereParts: SQL[] = [
          sql`jsonb_typeof(tool_calls) = 'array' AND tool_calls != '[]'::jsonb`,
          ...filterSqlParts,
        ]
        const innerWhereSql = sql`WHERE ${sql.join(innerWhereParts, sql` AND `)}`

        const [
          logRows,
          totalResult,
          overallSummary,
          byModel,
          byChatType,
          byToolCallsRaw,
        ] = await Promise.all([
          fastify.db
            .select()
            .from(chatbotAiUsage)
            .where(whereClause)
            .orderBy(desc(chatbotAiUsage.createdAt))
            .limit(limit)
            .offset(offset),

          fastify.db
            .select({ count: count() })
            .from(chatbotAiUsage)
            .where(whereClause),

          fastify.db
            .select({
              totalRequests: count(),
              totalInputTokens: sum(chatbotAiUsage.inputTokens),
              totalOutputTokens: sum(chatbotAiUsage.outputTokens),
              totalEstimatedCost: sum(chatbotAiUsage.estimatedCost),
            })
            .from(chatbotAiUsage)
            .where(whereClause),

          fastify.db
            .select({
              modelId: chatbotAiUsage.modelId,
              count: count(),
              totalCost: sum(chatbotAiUsage.estimatedCost),
            })
            .from(chatbotAiUsage)
            .where(whereClause)
            .groupBy(chatbotAiUsage.modelId),

          fastify.db
            .select({
              chatType: chatbotAiUsage.chatType,
              count: count(),
              totalCost: sum(chatbotAiUsage.estimatedCost),
            })
            .from(chatbotAiUsage)
            .where(whereClause)
            .groupBy(chatbotAiUsage.chatType),

          fastify.db.execute(sql`
            SELECT elems.value AS tool_name, COUNT(*)::int AS count
            FROM (
              SELECT tool_calls FROM chatbot_ai_usage ${innerWhereSql}
            ) filtered
            CROSS JOIN LATERAL jsonb_array_elements_text(filtered.tool_calls) AS elems(value)
            GROUP BY elems.value
            ORDER BY count DESC
          `),
        ])

        const totals = overallSummary[0]

        const logs = logRows.map((row) => ({
          ...row,
          estimatedCost:
            row.estimatedCost != null ? String(row.estimatedCost) : null,
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : String(row.createdAt),
        }))

        type ToolRow = { tool_name: string; count: number | string }
        const toolRows = byToolCallsRaw as unknown as ToolRow[]
        const byToolCalls = toolRows.map((r) => ({
          toolName: r.tool_name,
          count: Number(r.count),
        }))

        request.log.info(
          { total: totalResult[0].count, limit, offset },
          'Admin: chatbot AI usage retrieved'
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
            byModel: byModel.map((row) => ({
              modelId: row.modelId,
              count: row.count,
              totalCost: row.totalCost ? Number(row.totalCost) : null,
            })),
            byChatType: byChatType.map((row) => ({
              chatType: row.chatType,
              count: row.count,
              totalCost: row.totalCost ? Number(row.totalCost) : null,
            })),
            byToolCalls,
          },
        }
      } catch (error) {
        request.log.error(
          { err: error },
          'Admin: failed to retrieve chatbot AI usage'
        )

        return reply.status(500).send({
          message: 'Failed to retrieve chatbot AI usage',
          ...(process.env.NODE_ENV !== 'production' && {
            detail: String(error),
          }),
        })
      }
    }
  )
}
