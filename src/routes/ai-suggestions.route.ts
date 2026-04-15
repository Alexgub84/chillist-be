import { randomUUID } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  participants,
  plans,
  aiSuggestions,
  ITEM_CATEGORY_VALUES,
} from '../db/schema.js'
import type { ItemCategory } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { config } from '../config.js'
import {
  generateItemSuggestions,
  resolveAiLang,
} from '../services/ai/item-suggestions/index.js'
import type { ItemSuggestionsResult } from '../services/ai/item-suggestions/index.js'
import { resolveLanguageModel } from '../services/ai/model-provider.js'
import { aggregateDietarySummary } from '../services/ai/dietary-summary.js'
import { recordAiUsage } from '../services/ai/usage-tracking.js'
import type {
  PlanForAiContext,
  CategoryFilter,
} from '../services/ai/plan-context-formatters.js'
import type { SupportedAiLang } from '../services/ai/item-suggestions/prompt-templates.js'

const ALL_CATEGORIES: ItemCategory[] = [...ITEM_CATEGORY_VALUES]

function writeSseEvent(
  raw: import('node:http').ServerResponse,
  event: string,
  data: unknown
) {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function aiSuggestionsRoutes(fastify: FastifyInstance) {
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

  fastify.post<{
    Params: { planId: string }
    Body: { categories?: CategoryFilter }
  }>(
    '/plans/:planId/ai-suggestions',
    {
      schema: {
        tags: ['items'],
        summary: 'Generate AI item suggestions for a plan',
        description:
          'Uses AI to generate a list of suggested packing/food items based on plan context (dates, location, tags, participants). Output language is determined by the plan defaultLang field (en, he, es). JWT required. Must be a participant.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'AiSuggestionsRequest#' },
        response: {
          200: {
            description: 'AI-generated item suggestions',
            $ref: 'AiSuggestionsResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan does not exist',
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
      const { categories } = request.body ?? {}

      try {
        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const [plan] = await fastify.db
          .select({
            title: plans.title,
            startDate: plans.startDate,
            endDate: plans.endDate,
            location: plans.location,
            tags: plans.tags,
            estimatedAdults: plans.estimatedAdults,
            estimatedKids: plans.estimatedKids,
            defaultLang: plans.defaultLang,
          })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const lang = resolveAiLang(plan.defaultLang)

        const participantDietRows = await fastify.db
          .select({
            foodPreferences: participants.foodPreferences,
            dietaryMembers: participants.dietaryMembers,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              inArray(participants.rsvpStatus, ['confirmed', 'pending'])
            )
          )

        const dietarySummary = aggregateDietarySummary(participantDietRows)

        const planContext: PlanForAiContext = {
          title: plan.title,
          startDate: plan.startDate,
          endDate: plan.endDate,
          location: plan.location,
          tags: plan.tags,
          estimatedAdults: plan.estimatedAdults,
          estimatedKids: plan.estimatedKids,
          ...(dietarySummary ? { dietarySummary } : {}),
          ...(categories ? { categories } : {}),
        }

        const startMs = Date.now()

        const model = resolveLanguageModel(config.aiProvider, lang)

        const result = await generateItemSuggestions(model, planContext, lang)
        const durationMs = Date.now() - startMs

        if (result.status === 'error') {
          recordAiUsage(fastify.db, {
            featureType: 'item_suggestions',
            planId,
            userId: request.user?.id,
            sessionId: request.sessionId ?? null,
            provider: config.aiProvider,
            modelId: model.modelId,
            lang,
            status: 'error',
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            durationMs,
            promptLength: result.prompt.length,
            promptText: result.prompt,
            rawResponseText: result.rawResponseText,
            errorType: result.errorType,
            errorMessage: result.errorMessage,
            metadata: { planTitle: plan.title },
          })

          request.log.error(
            {
              planId,
              errorType: result.errorType,
              errorMessage: result.errorMessage,
            },
            'Failed to generate AI suggestions'
          )

          const isAiError = result.errorType?.startsWith('AI_')
          return reply.status(isAiError ? 503 : 500).send({
            message: isAiError
              ? 'AI service temporarily unavailable'
              : 'Failed to generate suggestions',
          })
        }

        await fastify.db
          .update(plans)
          .set({ aiGenerationCount: sql`${plans.aiGenerationCount} + 1` })
          .where(eq(plans.planId, planId))

        const filteredSuggestions = categories
          ? result.suggestions.filter((s) => s.category in categories)
          : result.suggestions

        const aiUsageLogId = await recordAiUsage(fastify.db, {
          featureType: 'item_suggestions',
          planId,
          userId: request.user?.id,
          sessionId: request.sessionId ?? null,
          provider: config.aiProvider,
          modelId: model.modelId,
          lang,
          status: result.status,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          durationMs,
          promptLength: result.prompt.length,
          promptText: result.prompt,
          rawResponseText: result.rawResponseText,
          finishReason: result.finishReason,
          resultCount: filteredSuggestions.length,
          metadata: { planTitle: plan.title },
        })

        let storedSuggestions: Array<{ id: string }> = []
        if (filteredSuggestions.length > 0) {
          try {
            storedSuggestions = await fastify.db
              .insert(aiSuggestions)
              .values(
                filteredSuggestions.map((s) => ({
                  aiUsageLogId: aiUsageLogId ?? null,
                  planId,
                  name: s.name,
                  category: s.category,
                  subcategory: s.subcategory,
                  quantity: String(s.quantity),
                  unit: s.unit,
                  reason: s.reason,
                }))
              )
              .returning({ id: aiSuggestions.id })
          } catch (err) {
            request.log.error(
              { err, planId },
              'Failed to persist AI suggestion rows — returning suggestions without IDs'
            )
          }
        }

        const suggestionsWithIds = filteredSuggestions.map((s, i) => ({
          id: storedSuggestions[i]?.id ?? '',
          ...s,
        }))

        const durationSec = (durationMs / 1000).toFixed(1)
        request.log.info(
          {
            planId,
            lang,
            modelId: model.modelId,
            promptLength: result.prompt.length,
            rawCount: result.suggestions.length,
            filteredCount: filteredSuggestions.length,
            usage: result.usage,
            durationSec,
          },
          `AI item suggestions generated in ${durationSec}s — ${filteredSuggestions.length} items (${result.suggestions.length} raw), ${result.usage.totalTokens ?? '?'} tokens (${model.modelId})`
        )

        return {
          aiUsageLogId: aiUsageLogId ?? '',
          suggestions: suggestionsWithIds,
        }
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to generate AI suggestions'
        )

        return reply.status(500).send({
          message: 'Failed to generate suggestions',
        })
      }
    }
  )

  fastify.post<{
    Params: { planId: string }
    Body: { categories?: CategoryFilter }
  }>(
    '/plans/:planId/ai-suggestions/stream',
    {
      schema: {
        tags: ['items'],
        summary: 'Stream AI item suggestions by category (SSE)',
        description:
          'Fires one AI call per category in parallel and streams results via Server-Sent Events as each category completes. ' +
          'Events: "suggestions" (per-category results), "error" (per-category failure), "done" (final summary). ' +
          'JWT required. Must be a participant.',
        params: { $ref: 'PlanIdParam#' },
        body: { $ref: 'AiSuggestionsRequest#' },
        response: {
          200: {
            description:
              'SSE stream — event: suggestions | error | done. See AiSuggestionsStreamDescription for event format.',
            $ref: 'AiSuggestionsStreamDescription#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Not found — plan does not exist',
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
      const { planId } = request.params
      const { categories: bodyCategories } = request.body ?? {}

      try {
        const { allowed } = await checkPlanAccess(
          fastify.db,
          planId,
          request.user
        )

        if (!allowed) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const [plan] = await fastify.db
          .select({
            title: plans.title,
            startDate: plans.startDate,
            endDate: plans.endDate,
            location: plans.location,
            tags: plans.tags,
            estimatedAdults: plans.estimatedAdults,
            estimatedKids: plans.estimatedKids,
            defaultLang: plans.defaultLang,
          })
          .from(plans)
          .where(eq(plans.planId, planId))

        if (!plan) {
          return reply.status(404).send({ message: 'Plan not found' })
        }

        const lang = resolveAiLang(plan.defaultLang)

        const participantDietRows = await fastify.db
          .select({
            foodPreferences: participants.foodPreferences,
            dietaryMembers: participants.dietaryMembers,
          })
          .from(participants)
          .where(
            and(
              eq(participants.planId, planId),
              inArray(participants.rsvpStatus, ['confirmed', 'pending'])
            )
          )

        const dietarySummary = aggregateDietarySummary(participantDietRows)

        const requestedCategories: ItemCategory[] = bodyCategories
          ? (ALL_CATEGORIES.filter(
              (c) => c in bodyCategories
            ) as ItemCategory[])
          : ALL_CATEGORIES

        if (requestedCategories.length === 0) {
          return reply.status(400).send({
            message: 'No valid categories requested',
          })
        }

        reply.hijack()
        const raw = reply.raw
        raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        const streamRequestId = randomUUID()
        const abortController = new AbortController()
        let clientDisconnected = false

        request.raw.on('close', () => {
          clientDisconnected = true
          abortController.abort()
        })

        const model = resolveLanguageModel(config.aiProvider, lang)

        const categoryPromises = requestedCategories.map((category) => {
          const catFilter: CategoryFilter = {
            [category]: bodyCategories?.[category] ?? [],
          }
          const planContext: PlanForAiContext = {
            title: plan.title,
            startDate: plan.startDate,
            endDate: plan.endDate,
            location: plan.location,
            tags: plan.tags,
            estimatedAdults: plan.estimatedAdults,
            estimatedKids: plan.estimatedKids,
            ...(dietarySummary ? { dietarySummary } : {}),
            categories: catFilter,
          }
          return { category, planContext }
        })

        const aiUsageLogIds: string[] = []
        const errors: string[] = []
        let totalSuggestions = 0

        const processCategoryResult = async (
          category: ItemCategory,
          result: ItemSuggestionsResult,
          durationMs: number
        ) => {
          if (result.status === 'error') {
            recordAiUsage(fastify.db, {
              featureType: 'item_suggestions',
              planId,
              userId: request.user?.id,
              sessionId: request.sessionId ?? null,
              provider: config.aiProvider,
              modelId: model.modelId,
              lang,
              status: 'error',
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens: result.usage.totalTokens,
              durationMs,
              promptLength: result.prompt.length,
              promptText: result.prompt,
              rawResponseText: result.rawResponseText,
              errorType: result.errorType,
              errorMessage: result.errorMessage,
              metadata: {
                planTitle: plan.title,
                streamRequestId,
                targetCategory: category,
                streamMode: true,
              },
            })

            errors.push(category)
            if (!clientDisconnected) {
              const isAiError = result.errorType?.startsWith('AI_')
              writeSseEvent(raw, 'error', {
                category,
                message: isAiError
                  ? 'AI service temporarily unavailable'
                  : 'Failed to generate suggestions',
              })
            }
            return
          }

          const filteredSuggestions = result.suggestions.filter(
            (s) => s.category === category
          )

          const aiUsageLogId = await recordAiUsage(fastify.db, {
            featureType: 'item_suggestions',
            planId,
            userId: request.user?.id,
            sessionId: request.sessionId ?? null,
            provider: config.aiProvider,
            modelId: model.modelId,
            lang,
            status: result.status,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            durationMs,
            promptLength: result.prompt.length,
            promptText: result.prompt,
            rawResponseText: result.rawResponseText,
            finishReason: result.finishReason,
            resultCount: filteredSuggestions.length,
            metadata: {
              planTitle: plan.title,
              streamRequestId,
              targetCategory: category,
              streamMode: true,
            },
          })

          if (aiUsageLogId) aiUsageLogIds.push(aiUsageLogId)

          let storedSuggestions: Array<{ id: string }> = []
          if (filteredSuggestions.length > 0) {
            try {
              storedSuggestions = await fastify.db
                .insert(aiSuggestions)
                .values(
                  filteredSuggestions.map((s) => ({
                    aiUsageLogId: aiUsageLogId ?? null,
                    planId,
                    name: s.name,
                    category: s.category,
                    subcategory: s.subcategory,
                    quantity: String(s.quantity),
                    unit: s.unit,
                    reason: s.reason,
                  }))
                )
                .returning({ id: aiSuggestions.id })
            } catch (err) {
              request.log.error(
                { err, planId, category },
                'Failed to persist AI suggestion rows for category'
              )
            }
          }

          const suggestionsWithIds = filteredSuggestions.map((s, i) => ({
            id: storedSuggestions[i]?.id ?? '',
            ...s,
          }))

          totalSuggestions += suggestionsWithIds.length

          if (!clientDisconnected) {
            writeSseEvent(raw, 'suggestions', {
              category,
              suggestions: suggestionsWithIds,
              aiUsageLogId: aiUsageLogId ?? '',
            })
          }

          const durationSec = (durationMs / 1000).toFixed(1)
          request.log.info(
            {
              planId,
              category,
              lang,
              modelId: model.modelId,
              count: suggestionsWithIds.length,
              usage: result.usage,
              durationSec,
              streamRequestId,
            },
            `AI stream [${category}] ${suggestionsWithIds.length} items in ${durationSec}s (${model.modelId})`
          )
        }

        await streamCategoriesInParallel(
          categoryPromises,
          model,
          lang,
          abortController.signal,
          processCategoryResult
        )

        if (!clientDisconnected) {
          await fastify.db
            .update(plans)
            .set({
              aiGenerationCount: sql`${plans.aiGenerationCount} + 1`,
            })
            .where(eq(plans.planId, planId))

          writeSseEvent(raw, 'done', {
            totalSuggestions,
            aiUsageLogIds,
            errors,
          })
        }

        raw.end()
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to stream AI suggestions'
        )

        if (!reply.sent) {
          return reply.status(500).send({
            message: 'Failed to generate suggestions',
          })
        }
        reply.raw.end()
      }
    }
  )
}

async function streamCategoriesInParallel(
  categoryJobs: Array<{
    category: ItemCategory
    planContext: PlanForAiContext
  }>,
  model: ReturnType<typeof resolveLanguageModel>,
  lang: SupportedAiLang,
  _signal: AbortSignal,
  onResult: (
    category: ItemCategory,
    result: ItemSuggestionsResult,
    durationMs: number
  ) => Promise<void>
) {
  const promises = categoryJobs.map(async ({ category, planContext }) => {
    const startMs = Date.now()
    try {
      const result = await generateItemSuggestions(model, planContext, lang)
      const durationMs = Date.now() - startMs
      await onResult(category, result, durationMs)
    } catch (error) {
      const durationMs = Date.now() - startMs
      const err = error instanceof Error ? error : new Error(String(error))
      const errorResult: ItemSuggestionsResult = {
        status: 'error',
        suggestions: [],
        prompt: '',
        rawResponseText: null,
        errorType: err.name,
        errorMessage: err.message,
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      }
      await onResult(category, errorResult, durationMs)
    }
  })

  await Promise.allSettled(promises)
}
