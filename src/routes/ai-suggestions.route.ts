import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { plans } from '../db/schema.js'
import { checkPlanAccess } from '../utils/plan-access.js'
import {
  generateItemSuggestions,
  resolveAiLang,
} from '../services/ai/item-suggestions/index.js'
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

        const planContext: PlanForAiContext = {
          title: plan.title,
          startDate: plan.startDate,
          endDate: plan.endDate,
          location: plan.location,
          tags: plan.tags,
          estimatedAdults: plan.estimatedAdults,
          estimatedKids: plan.estimatedKids,
        }

        const result = await generateItemSuggestions(
          fastify.aiModel,
          planContext,
          lang
        )

        request.log.info(
          {
            planId,
            lang,
            promptLength: result.prompt.length,
            suggestionsCount: result.suggestions.length,
            usage: result.usage,
          },
          'AI item suggestions generated'
        )

        return { suggestions: result.suggestions }
      } catch (error) {
        request.log.error(
          { err: error, planId },
          'Failed to generate AI suggestions'
        )

        const isAiError =
          error instanceof Error && error.name?.startsWith('AI_')

        if (isAiError) {
          return reply.status(503).send({
            message: 'AI service temporarily unavailable',
          })
        }

        return reply.status(500).send({
          message: 'Failed to generate suggestions',
        })
      }
    }
  )
}
