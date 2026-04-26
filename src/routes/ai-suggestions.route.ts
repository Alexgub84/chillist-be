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
  resolveAiLang,
  generateItemSuggestions,
} from '../services/ai/item-suggestions/index.js'
import { resolveLanguageModel } from '../services/ai/model-provider.js'
import { aggregateDietarySummary } from '../services/ai/dietary-summary.js'
import { recordAiUsage } from '../services/ai/usage-tracking.js'
import type { PlanForAiContext } from '../services/ai/plan-context-formatters.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolveGenerationId(raw: string | undefined): string | null {
  if (!raw) return randomUUID()
  if (!UUID_RE.test(raw)) return null
  return raw
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
    Params: { planId: string; category: ItemCategory }
    Body: { subcategories?: string[] } | null
    Headers: { 'x-generation-id'?: string }
  }>(
    '/plans/:planId/ai-suggestions/:category',
    {
      schema: {
        tags: ['items'],
        summary: 'Generate AI item suggestions for a single category',
        description:
          'Fires one AI call for the given category and returns the generated items as plain JSON. ' +
          'The FE sends 3 parallel requests (one per category) and renders each response as it arrives. ' +
          'JWT required. Must be a participant of the plan.',
        params: { $ref: 'CategoryParam#' },
        body: { $ref: 'AiSuggestionsRequest#' },
        headers: {
          type: 'object',
          properties: {
            'x-generation-id': {
              type: 'string',
              description:
                'Optional UUID to correlate all 3 per-category calls of a single "Generate" click. BE generates a fallback UUID if missing.',
            },
          },
        },
        response: {
          200: { $ref: 'AiSuggestionsResponse#' },
          400: {
            description:
              'Invalid category path segment or invalid X-Generation-Id header',
            $ref: 'ErrorResponse#',
          },
          401: {
            description:
              'Authentication required — JWT token missing or invalid',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'Plan not found or user is not a participant',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
          502: {
            description: 'AI service temporarily unavailable',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { planId, category } = request.params

      if (!ITEM_CATEGORY_VALUES.includes(category)) {
        return reply.status(400).send({ message: 'Invalid category' })
      }

      const generationId = resolveGenerationId(
        request.headers['x-generation-id']
      )
      if (generationId === null) {
        return reply
          .status(400)
          .send({ message: 'X-Generation-Id must be a UUID' })
      }

      const subcategories = request.body?.subcategories ?? []

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
          categories: { [category]: subcategories },
        }

        const model = resolveLanguageModel(config.aiProvider, lang)

        const start = Date.now()
        const result = await generateItemSuggestions(model, planContext, lang)
        const durationMs = Date.now() - start

        const usageBase = {
          featureType: 'item_suggestions' as const,
          planId,
          userId: request.user?.id,
          sessionId: request.sessionId ?? null,
          provider: config.aiProvider,
          modelId: model.modelId,
          lang,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          durationMs,
          promptLength: result.prompt.length,
          promptText: result.prompt,
          rawResponseText: result.rawResponseText,
          metadata: {
            planTitle: plan.title,
            generationId,
            targetCategory: category,
          },
        }

        if (result.status === 'error') {
          await recordAiUsage(fastify.db, {
            ...usageBase,
            status: 'error',
            errorType: result.errorType,
            errorMessage: result.errorMessage,
          })

          request.log.warn(
            {
              planId,
              category,
              errorType: result.errorType,
              errorMessage: result.errorMessage,
              generationId,
            },
            'AI suggestions generation failed'
          )

          return reply
            .status(502)
            .send({ message: 'AI service temporarily unavailable' })
        }

        const filteredSuggestions = result.suggestions.filter(
          (s) => s.category === category
        )
        const rawItemCount = result.suggestions.length
        const filteredOutCount = rawItemCount - filteredSuggestions.length

        const aiUsageLogId = await recordAiUsage(fastify.db, {
          ...usageBase,
          metadata: {
            ...usageBase.metadata,
            rawItemCount,
            filteredOutCount,
          },
          status: result.status,
          finishReason: result.finishReason,
          resultCount: filteredSuggestions.length,
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
              { err, planId, category, generationId },
              'Failed to persist AI suggestion rows'
            )
          }
        }

        await fastify.db
          .update(plans)
          .set({
            aiGenerationCount: sql`${plans.aiGenerationCount} + 1`,
          })
          .where(eq(plans.planId, planId))

        const suggestionsWithIds = filteredSuggestions.map((s, i) => ({
          id: storedSuggestions[i]?.id ?? '',
          ...s,
        }))

        const durationSec = (durationMs / 1000).toFixed(1)
        request.log.info(
          {
            planId,
            category,
            lang,
            modelId: model.modelId,
            count: suggestionsWithIds.length,
            rawItemCount,
            filteredOutCount,
            usage: result.usage,
            durationSec,
            generationId,
          },
          `AI suggestions [${category}] ${suggestionsWithIds.length} items in ${durationSec}s (${model.modelId})`
        )

        return reply.send({
          suggestions: suggestionsWithIds,
          aiUsageLogId: aiUsageLogId ?? '',
          generationId,
        })
      } catch (error) {
        request.log.error(
          { err: error, planId, category, generationId },
          'Failed to generate AI suggestions'
        )
        return reply.status(500).send({
          message: 'Failed to generate suggestions',
        })
      }
    }
  )
}
