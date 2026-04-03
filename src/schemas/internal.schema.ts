export const identifyRequestSchema = {
  $id: 'IdentifyRequest',
  type: 'object',
  required: ['phoneNumber'],
  properties: {
    phoneNumber: { type: 'string', minLength: 7 },
  },
  additionalProperties: false,
} as const

export const identifyResponseSchema = {
  $id: 'IdentifyResponse',
  type: 'object',
  required: ['userId', 'displayName'],
  properties: {
    userId: {
      type: 'string',
      format: 'uuid',
      description: 'Supabase user UUID of the identified registered user.',
    },
    displayName: {
      type: 'string',
      description: 'Display name resolved from the participant record.',
    },
  },
  additionalProperties: false,
} as const

export const internalPlanSummarySchema = {
  $id: 'InternalPlanSummary',
  type: 'object',
  description:
    'Chatbot-facing plan summary. Field names are simplified (name/date instead of title/startDate). completedItemCount counts items where every assignment entry has status packed or purchased.',
  required: [
    'id',
    'name',
    'role',
    'participantCount',
    'itemCount',
    'completedItemCount',
  ],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Plan UUID (maps to plans.planId).',
    },
    name: {
      type: 'string',
      description: 'Plan title (maps to plans.title).',
    },
    date: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description:
        'Plan start date in ISO 8601 (maps to plans.startDate). Null if not set.',
    },
    role: {
      type: 'string',
      enum: ['owner', 'participant', 'viewer'],
      description: "The resolved user's role in this plan.",
    },
    participantCount: {
      type: 'integer',
      description: 'Total number of participants on the plan.',
    },
    itemCount: {
      type: 'integer',
      description: 'Total number of items on the plan.',
    },
    completedItemCount: {
      type: 'integer',
      description:
        'Items where assignmentStatusList is non-empty and every entry has status packed or purchased.',
    },
  },
  additionalProperties: false,
} as const

export const internalPlansResponseSchema = {
  $id: 'InternalPlansResponse',
  type: 'object',
  description: 'Response for GET /api/internal/plans.',
  required: ['plans'],
  properties: {
    plans: {
      type: 'array',
      items: { $ref: 'InternalPlanSummary#' },
      description:
        'Plans the user is a member of, ordered by creation date (oldest first).',
    },
  },
  additionalProperties: false,
} as const

export const internalPlanDetailParticipantSchema = {
  $id: 'InternalPlanDetailParticipant',
  type: 'object',
  required: ['id', 'name', 'role'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    role: {
      type: 'string',
      enum: ['owner', 'participant', 'viewer'],
    },
  },
} as const

export const internalPlanDetailItemSchema = {
  $id: 'InternalPlanDetailItem',
  type: 'object',
  required: ['id', 'name', 'status', 'assignee', 'category'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    status: {
      type: 'string',
      enum: ['done', 'pending'],
      description:
        'Calling user’s assignment: done if packed or purchased; otherwise pending.',
    },
    assignee: {
      type: 'string',
      nullable: true,
      description:
        'Human-readable assignee label(s); null if unassigned or assign-to-all.',
    },
    category: {
      type: 'string',
      enum: ['gear', 'food'],
      description: 'group_equipment and personal_equipment map to gear.',
    },
  },
} as const

export const internalPlanDetailSchema = {
  $id: 'InternalPlanDetail',
  type: 'object',
  required: ['id', 'name', 'date', 'role', 'participants', 'items'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    date: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Plan start date (ISO 8601).',
    },
    role: {
      type: 'string',
      enum: ['owner', 'participant', 'viewer'],
    },
    participants: {
      type: 'array',
      items: { $ref: 'InternalPlanDetailParticipant#' },
    },
    items: {
      type: 'array',
      items: { $ref: 'InternalPlanDetailItem#' },
    },
  },
} as const

export const internalPlanDetailResponseSchema = {
  $id: 'InternalPlanDetailResponse',
  type: 'object',
  description: 'Response for GET /api/internal/plans/:planId.',
  required: ['plan'],
  additionalProperties: false,
  properties: {
    plan: { $ref: 'InternalPlanDetail#' },
  },
} as const

export const internalUpdateItemStatusBodySchema = {
  $id: 'InternalUpdateItemStatusBody',
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['done', 'pending'],
      description:
        'done maps to purchased; pending maps to pending in assignmentStatusList.',
    },
  },
} as const

export const internalUpdateItemStatusItemSchema = {
  $id: 'InternalUpdateItemStatusItem',
  type: 'object',
  required: ['id', 'name', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    status: {
      type: 'string',
      enum: ['done', 'pending'],
      description: 'Calling user’s assignment after update.',
    },
  },
} as const

export const internalUpdateItemStatusResponseSchema = {
  $id: 'InternalUpdateItemStatusResponse',
  type: 'object',
  description: 'Response for PATCH /api/internal/items/:itemId/status.',
  required: ['item'],
  additionalProperties: false,
  properties: {
    item: { $ref: 'InternalUpdateItemStatusItem#' },
  },
} as const
