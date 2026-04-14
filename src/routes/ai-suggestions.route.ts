import { FastifyInstance } from 'fastify'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { participants, plans, aiSuggestions } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import { config } from '../config.js'
import {
  generateItemSuggestions,
  resolveAiLang,
} from '../services/ai/item-suggestions/index.js'
import { resolveLanguageModel } from '../services/ai/model-provider.js'
import { aggregateDietarySummary } from '../services/ai/dietary-summary.js'
import { recordAiUsage } from '../services/ai/usage-tracking.js'
import type { PlanForAiContext } from '../services/ai/plan-context-formatters.js'

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

  fastify.post<{ Params: { planId: string } }>(
    '/plans/:planId/ai-suggestions',
    {
      schema: {
        tags: ['items'],
        summary: 'Generate AI item suggestions for a plan',
        description:
          'Uses AI to generate a list of suggested packing/food items based on plan context (dates, location, tags, participants). Output language is determined by the plan defaultLang field (en, he, es). JWT required. Must be a participant.',
        params: { $ref: 'PlanIdParam#' },
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
          resultCount: result.suggestions.length,
          metadata: { planTitle: plan.title },
        })

        let storedSuggestions: Array<{ id: string }> = []
        if (result.suggestions.length > 0) {
          try {
            storedSuggestions = await fastify.db
              .insert(aiSuggestions)
              .values(
                result.suggestions.map((s) => ({
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

        const suggestionsWithIds = result.suggestions.map((s, i) => ({
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
            suggestionsCount: result.suggestions.length,
            usage: result.usage,
            durationSec,
          },
          `AI item suggestions generated in ${durationSec}s — ${result.suggestions.length} items, ${result.usage.totalTokens ?? '?'} tokens (${model.modelId})`
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
}
