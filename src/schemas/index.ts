import { FastifyInstance } from 'fastify'
import {
  errorResponseSchema,
  paginationQuerySchema,
  paginationMetaSchema,
} from './common.js'
import { healthResponseSchema } from './health.schema.js'
import {
  locationSchema,
  planSchema,
  planListSchema,
  createPlanBodySchema,
  updatePlanBodySchema,
  planIdParamSchema,
  deletePlanResponseSchema,
  planWithItemsSchema,
} from './plan.schema.js'
import {
  itemSchema,
  itemListSchema,
  createItemBodySchema,
} from './item.schema.js'

const schemas = [
  errorResponseSchema,
  paginationQuerySchema,
  paginationMetaSchema,
  healthResponseSchema,
  locationSchema,
  planSchema,
  planListSchema,
  createPlanBodySchema,
  updatePlanBodySchema,
  planIdParamSchema,
  deletePlanResponseSchema,
  itemSchema,
  itemListSchema,
  createItemBodySchema,
  planWithItemsSchema,
]

export function registerSchemas(fastify: FastifyInstance) {
  for (const schema of schemas) {
    fastify.addSchema(schema)
  }
}

export * from './common.js'
export * from './health.schema.js'
export * from './plan.schema.js'
export * from './item.schema.js'
