export const chatbotAiUsageLogSchema = {
  $id: 'ChatbotAiUsageLog',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Primary key of this chatbot AI usage row',
    },
    sessionId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Chatbot session identifier',
    },
    userId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Supabase user id when known',
    },
    planId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Plan id when the call is plan-related',
    },
    provider: {
      type: 'string',
      description: 'AI provider (e.g. anthropic)',
    },
    modelId: {
      type: 'string',
      description: 'Model id from the provider',
    },
    lang: {
      type: 'string',
      nullable: true,
      description: 'ISO 639-1 language code when set',
    },
    chatType: {
      type: 'string',
      enum: ['dm', 'group'],
      description: 'Whether the chatbot turn was DM or group',
    },
    messageIndex: {
      type: 'integer',
      description: 'Zero-based message index within the session',
    },
    stepCount: {
      type: 'integer',
      description: 'Number of agentic steps',
    },
    toolCalls: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Tool names invoked in this turn',
    },
    toolCallCount: {
      type: 'integer',
      description: 'Total tool calls in this turn',
    },
    inputTokens: {
      type: 'integer',
      nullable: true,
      description: 'Input tokens',
    },
    outputTokens: {
      type: 'integer',
      nullable: true,
      description: 'Output tokens',
    },
    totalTokens: {
      type: 'integer',
      nullable: true,
      description: 'Total tokens when reported by the provider',
    },
    estimatedCost: {
      type: 'string',
      nullable: true,
      description:
        'Estimated cost in USD as a decimal string; null if pricing unknown',
    },
    durationMs: {
      type: 'integer',
      description: 'Wall-clock duration of the AI call in milliseconds',
    },
    status: {
      type: 'string',
      enum: ['success', 'error'],
      description: 'Whether the call completed successfully',
    },
    errorMessage: {
      type: 'string',
      nullable: true,
      description: 'Error message when status is error',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'When this row was written',
    },
  },
  required: [
    'id',
    'provider',
    'modelId',
    'chatType',
    'messageIndex',
    'stepCount',
    'toolCallCount',
    'durationMs',
    'status',
    'createdAt',
  ],
} as const

export const chatbotAiUsageLogListSchema = {
  $id: 'ChatbotAiUsageLogList',
  type: 'array',
  items: { $ref: 'ChatbotAiUsageLog#' },
} as const

export const chatbotAiUsageModelSummarySchema = {
  $id: 'ChatbotAiUsageModelSummary',
  type: 'object',
  properties: {
    modelId: {
      type: 'string',
      description: 'Model id',
    },
    count: {
      type: 'integer',
      description: 'Number of rows for this model within the filter',
    },
    totalCost: {
      type: 'number',
      nullable: true,
      description: 'Sum of estimated costs for this model (USD)',
    },
  },
  required: ['modelId', 'count'],
} as const

export const chatbotAiUsageChatTypeSummarySchema = {
  $id: 'ChatbotAiUsageChatTypeSummary',
  type: 'object',
  properties: {
    chatType: {
      type: 'string',
      description: 'dm or group',
    },
    count: {
      type: 'integer',
      description: 'Number of rows for this chat type within the filter',
    },
    totalCost: {
      type: 'number',
      nullable: true,
      description: 'Sum of estimated costs (USD)',
    },
  },
  required: ['chatType', 'count'],
} as const

export const chatbotAiUsageToolCallSummarySchema = {
  $id: 'ChatbotAiUsageToolCallSummary',
  type: 'object',
  properties: {
    toolName: {
      type: 'string',
      description: 'Tool name from flattened tool_calls arrays',
    },
    count: {
      type: 'integer',
      description: 'Occurrences of this tool name within the filter',
    },
  },
  required: ['toolName', 'count'],
} as const

export const chatbotAiUsageSummarySchema = {
  $id: 'ChatbotAiUsageSummary',
  type: 'object',
  properties: {
    totalRequests: {
      type: 'integer',
      description: 'Number of chatbot AI rows matching the filters',
    },
    totalInputTokens: {
      type: 'integer',
      description: 'Sum of input tokens',
    },
    totalOutputTokens: {
      type: 'integer',
      description: 'Sum of output tokens',
    },
    totalEstimatedCost: {
      type: 'number',
      nullable: true,
      description: 'Sum of estimated costs in USD',
    },
    byModel: {
      type: 'array',
      items: { $ref: 'ChatbotAiUsageModelSummary#' },
    },
    byChatType: {
      type: 'array',
      items: { $ref: 'ChatbotAiUsageChatTypeSummary#' },
    },
    byToolCalls: {
      type: 'array',
      items: { $ref: 'ChatbotAiUsageToolCallSummary#' },
    },
  },
  required: [
    'totalRequests',
    'totalInputTokens',
    'totalOutputTokens',
    'byModel',
    'byChatType',
    'byToolCalls',
  ],
} as const

export const chatbotAiUsageQuerySchema = {
  $id: 'ChatbotAiUsageQuery',
  type: 'object',
  properties: {
    userId: {
      type: 'string',
      format: 'uuid',
      description: 'Filter by user id',
    },
    sessionId: {
      type: 'string',
      format: 'uuid',
      description: 'Filter by chatbot session id',
    },
    chatType: {
      type: 'string',
      enum: ['dm', 'group'],
      description: 'Filter by chat type',
    },
    status: {
      type: 'string',
      enum: ['success', 'error'],
      description: 'Filter by call status',
    },
    from: {
      type: 'string',
      format: 'date-time',
      description: 'Include rows with created_at on or after this instant',
    },
    to: {
      type: 'string',
      format: 'date-time',
      description: 'Include rows with created_at on or before this instant',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Page size (max 200)',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      default: 0,
      description: 'Rows to skip',
    },
  },
} as const

export const chatbotAiUsageResponseSchema = {
  $id: 'ChatbotAiUsageResponse',
  type: 'object',
  description:
    'Paginated chatbot AI usage with aggregates. Admin only. Table is written by the chatbot service.',
  properties: {
    logs: { $ref: 'ChatbotAiUsageLogList#' },
    total: {
      type: 'integer',
      description: 'Total rows matching filters (for pagination)',
    },
    summary: { $ref: 'ChatbotAiUsageSummary#' },
  },
  required: ['logs', 'total', 'summary'],
} as const
