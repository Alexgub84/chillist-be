export const aiUsageLogSchema = {
  $id: 'AiUsageLog',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Primary key of this usage log row',
    },
    featureType: {
      type: 'string',
      enum: ['item_suggestions'],
      description: 'Which AI feature produced this usage record',
    },
    planId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description:
        'Plan associated with this AI call (null for non-plan features)',
    },
    userId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Supabase UUID of the user who triggered the AI call',
    },
    provider: {
      type: 'string',
      description: 'AI provider used (e.g. anthropic, openai)',
    },
    modelId: {
      type: 'string',
      description:
        'Bare model id from the provider SDK (e.g. claude-haiku-4-5-20251001), matching Vercel AI `model.modelId`',
    },
    lang: {
      type: 'string',
      nullable: true,
      description: 'Language used for generation (ISO 639-1)',
    },
    status: {
      type: 'string',
      enum: ['success', 'partial', 'error'],
      description:
        'Outcome: success (all items valid), partial (salvaged from failed parse), error (generation failed)',
    },
    inputTokens: {
      type: 'integer',
      nullable: true,
      description: 'Number of input tokens consumed',
    },
    outputTokens: {
      type: 'integer',
      nullable: true,
      description: 'Number of output tokens generated',
    },
    totalTokens: {
      type: 'integer',
      nullable: true,
      description: 'Total tokens (input + output)',
    },
    estimatedCost: {
      type: 'string',
      nullable: true,
      description:
        'Estimated cost in USD as a decimal string (e.g. "0.004800"). Null if model pricing is unknown.',
    },
    durationMs: {
      type: 'integer',
      description: 'Wall-clock time of the AI call in milliseconds',
    },
    promptLength: {
      type: 'integer',
      nullable: true,
      description: 'Character count of the assembled prompt',
    },
    resultCount: {
      type: 'integer',
      nullable: true,
      description: 'Number of results returned (e.g. item suggestions count)',
    },
    errorMessage: {
      type: 'string',
      nullable: true,
      description: 'Error message when status is error',
    },
    metadata: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
      description: 'Feature-specific context (e.g. plan title, tags)',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description:
        'When the AI call finished and this row was written (ISO 8601)',
    },
  },
  required: [
    'id',
    'featureType',
    'provider',
    'modelId',
    'status',
    'durationMs',
    'createdAt',
  ],
} as const

export const aiUsageLogListSchema = {
  $id: 'AiUsageLogList',
  type: 'array',
  items: { $ref: 'AiUsageLog#' },
} as const

export const aiUsageFeatureSummarySchema = {
  $id: 'AiUsageFeatureSummary',
  type: 'object',
  properties: {
    featureType: {
      type: 'string',
      description: 'AI feature type (same enum as on each log row)',
    },
    count: {
      type: 'integer',
      description: 'Number of log rows for this feature within the filter',
    },
    totalCost: {
      type: 'number',
      nullable: true,
      description:
        'Sum of estimated costs for this feature (USD), null if unknown',
    },
  },
  required: ['featureType', 'count'],
} as const

export const aiUsageModelSummarySchema = {
  $id: 'AiUsageModelSummary',
  type: 'object',
  properties: {
    modelId: {
      type: 'string',
      description: 'Bare model id (same as on each log row)',
    },
    count: {
      type: 'integer',
      description: 'Number of log rows for this model within the filter',
    },
    totalCost: {
      type: 'number',
      nullable: true,
      description:
        'Sum of estimated costs for this model (USD), null if unknown',
    },
  },
  required: ['modelId', 'count'],
} as const

export const aiUsageSummarySchema = {
  $id: 'AiUsageSummary',
  type: 'object',
  properties: {
    totalRequests: {
      type: 'integer',
      description: 'Total number of AI requests matching the filters',
    },
    totalInputTokens: {
      type: 'integer',
      description: 'Sum of input tokens across matching rows',
    },
    totalOutputTokens: {
      type: 'integer',
      description: 'Sum of output tokens across matching rows',
    },
    totalEstimatedCost: {
      type: 'number',
      nullable: true,
      description: 'Sum of estimated costs in USD',
    },
    byFeature: {
      type: 'array',
      items: { $ref: 'AiUsageFeatureSummary#' },
    },
    byModel: {
      type: 'array',
      items: { $ref: 'AiUsageModelSummary#' },
    },
  },
  required: [
    'totalRequests',
    'totalInputTokens',
    'totalOutputTokens',
    'byFeature',
    'byModel',
  ],
} as const

export const aiUsageQuerySchema = {
  $id: 'AiUsageQuery',
  type: 'object',
  properties: {
    planId: {
      type: 'string',
      format: 'uuid',
      description: 'Filter by plan ID',
    },
    userId: {
      type: 'string',
      format: 'uuid',
      description: 'Filter by user who triggered the AI call',
    },
    featureType: {
      type: 'string',
      enum: ['item_suggestions'],
      description: 'Filter by AI feature type',
    },
    status: {
      type: 'string',
      enum: ['success', 'partial', 'error'],
      description: 'Filter by result status',
    },
    from: {
      type: 'string',
      format: 'date-time',
      description: 'Filter by created after this date (ISO 8601)',
    },
    to: {
      type: 'string',
      format: 'date-time',
      description: 'Filter by created before this date (ISO 8601)',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Number of records to return (max 200)',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      default: 0,
      description: 'Number of records to skip',
    },
  },
} as const

export const aiUsageResponseSchema = {
  $id: 'AiUsageResponse',
  type: 'object',
  description: 'Paginated AI usage logs with aggregated summary. Admin only.',
  properties: {
    logs: { $ref: 'AiUsageLogList#' },
    total: {
      type: 'integer',
      description: 'Total count of records matching filters (for pagination)',
    },
    summary: { $ref: 'AiUsageSummary#' },
  },
  required: ['logs', 'total', 'summary'],
} as const
