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
  ownerBodySchema,
  createPlanBodySchema,
  updatePlanBodySchema,
  planIdParamSchema,
  deletePlanResponseSchema,
  planWithDetailsSchema,
} from './plan.schema.js'
import {
  itemSchema,
  itemListSchema,
  createItemBodySchema,
  updateItemBodySchema,
  itemIdParamSchema,
  bulkCreateItemBodySchema,
  bulkUpdateItemEntrySchema,
  bulkUpdateItemBodySchema,
  bulkItemErrorSchema,
  bulkItemResponseSchema,
} from './item.schema.js'
import {
  participantSchema,
  participantListSchema,
  createParticipantBodySchema,
  updateParticipantBodySchema,
  participantIdParamSchema,
  deleteParticipantResponseSchema,
} from './participant.schema.js'
import {
  inviteParamsSchema,
  inviteParticipantSchema,
  inviteParticipantListSchema,
  invitePlanResponseSchema,
  inviteMyPreferencesSchema,
  regenerateTokenParamsSchema,
  regenerateTokenResponseSchema,
  updateInvitePreferencesBodySchema,
  invitePreferencesResponseSchema,
  inviteItemParamsSchema,
  createInviteItemBodySchema,
  updateInviteItemBodySchema,
  bulkCreateInviteItemBodySchema,
  bulkUpdateInviteItemEntrySchema,
  bulkUpdateInviteItemBodySchema,
} from './invite.schema.js'
import {
  userPreferencesSchema,
  profileResponseSchema,
  updateProfileBodySchema,
  updateProfileResponseSchema,
} from './auth.schema.js'

const schemas = [
  errorResponseSchema,
  paginationQuerySchema,
  paginationMetaSchema,
  healthResponseSchema,
  locationSchema,
  planSchema,
  planListSchema,
  ownerBodySchema,
  createPlanBodySchema,
  updatePlanBodySchema,
  planIdParamSchema,
  deletePlanResponseSchema,
  itemSchema,
  itemListSchema,
  createItemBodySchema,
  updateItemBodySchema,
  itemIdParamSchema,
  participantSchema,
  participantListSchema,
  createParticipantBodySchema,
  updateParticipantBodySchema,
  participantIdParamSchema,
  deleteParticipantResponseSchema,
  planWithDetailsSchema,
  inviteParamsSchema,
  inviteParticipantSchema,
  inviteParticipantListSchema,
  inviteMyPreferencesSchema,
  invitePlanResponseSchema,
  regenerateTokenParamsSchema,
  regenerateTokenResponseSchema,
  updateInvitePreferencesBodySchema,
  invitePreferencesResponseSchema,
  inviteItemParamsSchema,
  createInviteItemBodySchema,
  updateInviteItemBodySchema,
  bulkCreateItemBodySchema,
  bulkUpdateItemEntrySchema,
  bulkUpdateItemBodySchema,
  bulkItemErrorSchema,
  bulkItemResponseSchema,
  bulkCreateInviteItemBodySchema,
  bulkUpdateInviteItemEntrySchema,
  bulkUpdateInviteItemBodySchema,
  userPreferencesSchema,
  profileResponseSchema,
  updateProfileBodySchema,
  updateProfileResponseSchema,
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
export * from './participant.schema.js'
export * from './invite.schema.js'
export * from './auth.schema.js'
