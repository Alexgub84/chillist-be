import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import { config } from '../config.js'
import { resolveLanguageModel } from '../services/ai/model-provider.js'

export interface AiModelPluginOptions {
  model?: LanguageModelV2
}

async function aiModelPlugin(
  fastify: FastifyInstance,
  opts: AiModelPluginOptions = {}
) {
  const model = opts.model ?? resolveLanguageModel(config.aiProvider)

  fastify.decorate('aiModel', model)
  fastify.log.info(
    { provider: config.aiProvider, modelId: model.modelId },
    'AI model registered'
  )
}

export default fp(aiModelPlugin, { name: 'ai-model' })
