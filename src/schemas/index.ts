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
  pendingJoinRequestPreviewSchema,
  pendingJoinRequestPreviewListSchema,
  ownerBodySchema,
  createPlanBodySchema,
  updatePlanBodySchema,
  planIdParamSchema,
  deletePlanResponseSchema,
  planWithDetailsSchema,
  planNotLoggedInResponseSchema,
  planPreviewFieldsSchema,
  planNotParticipantResponseSchema,
} from './plan.schema.js'
import {
  joinRequestSchema,
  joinRequestListSchema,
  joinRequestActionParamsSchema,
  updateJoinRequestStatusBodySchema,
  createJoinRequestBodySchema,
} from './join-request.schema.js'
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
import {
  expenseSchema,
  expenseListSchema,
  expenseSummarySchema,
  expenseSummaryListSchema,
  expensesResponseSchema,
  createExpenseBodySchema,
  updateExpenseBodySchema,
  expenseIdParamSchema,
  deleteExpenseResponseSchema,
} from './expense.schema.js'
import {
  sendListBodySchema,
  sendListResponseSchema,
} from './send-list.schema.js'
import {
  identifyRequestSchema,
  identifyResponseSchema,
  internalPlanSummarySchema,
  internalPlansResponseSchema,
} from './internal.schema.js'
import {
  dietaryMemberSchema,
  dietaryMembersBodySchema,
} from './dietary.schema.js'

const schemas = [
  errorResponseSchema,
  paginationQuerySchema,
  paginationMetaSchema,
  healthResponseSchema,
  locationSchema,
  planSchema,
  planListSchema,
  pendingJoinRequestPreviewSchema,
  pendingJoinRequestPreviewListSchema,
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
  planNotLoggedInResponseSchema,
  planPreviewFieldsSchema,
  joinRequestSchema,
  joinRequestActionParamsSchema,
  updateJoinRequestStatusBodySchema,
  planNotParticipantResponseSchema,
  joinRequestListSchema,
  createJoinRequestBodySchema,
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
  expenseSchema,
  expenseListSchema,
  expenseSummarySchema,
  expenseSummaryListSchema,
  expensesResponseSchema,
  createExpenseBodySchema,
  updateExpenseBodySchema,
  expenseIdParamSchema,
  deleteExpenseResponseSchema,
  sendListBodySchema,
  sendListResponseSchema,
  identifyRequestSchema,
  identifyResponseSchema,
  internalPlanSummarySchema,
  internalPlansResponseSchema,
  dietaryMemberSchema,
  dietaryMembersBodySchema,
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
export * from './join-request.schema.js'
export * from './expense.schema.js'
export * from './send-list.schema.js'
export * from './internal.schema.js'
export * from './dietary.schema.js'
