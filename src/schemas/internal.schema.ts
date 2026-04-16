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
        'Plans the user is a member of that are undated or have startDate at or after now (UTC); past-dated plans are omitted. Ordered by creation date (oldest first).',
    },
  },
  additionalProperties: false,
} as const

export const internalPlanDetailParticipantSchema = {
  $id: 'InternalPlanDetailParticipant',
  type: 'object',
  description: 'Participant row in internal plan detail.',
  required: ['id', 'name', 'role'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Participant UUID.',
    },
    name: {
      type: 'string',
      description: 'displayName if set, otherwise first name plus last name.',
    },
    role: {
      type: 'string',
      enum: ['owner', 'participant', 'viewer'],
      description: 'Participant role on the plan.',
    },
  },
  additionalProperties: false,
} as const

export const internalPlanDetailItemSchema = {
  $id: 'InternalPlanDetailItem',
  type: 'object',
  description:
    'Item row for chatbot. status reflects the calling user only. category maps DB enums to gear or food.',
  required: ['id', 'name', 'status', 'assignee', 'category'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Item UUID.',
    },
    name: { type: 'string', description: 'Item name.' },
    status: {
      type: 'string',
      enum: ['done', 'pending'],
      description:
        'Calling user assignment: done if packed or purchased, else pending (including no entry).',
    },
    assignee: {
      type: 'string',
      nullable: true,
      description:
        'Display names of assignees from assignmentStatusList, or null if isAllParticipants or list empty.',
    },
    category: {
      type: 'string',
      enum: ['gear', 'food'],
      description: 'group_equipment and personal_equipment map to gear.',
    },
  },
  additionalProperties: false,
} as const

export const internalPlanDetailSchema = {
  $id: 'InternalPlanDetail',
  type: 'object',
  description: 'Full plan for chatbot context.',
  required: ['id', 'name', 'date', 'role', 'participants', 'items'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Plan UUID.',
    },
    name: { type: 'string', description: 'Plan title.' },
    date: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Plan start date ISO 8601, or null.',
    },
    role: {
      type: 'string',
      enum: ['owner', 'participant', 'viewer'],
      description: 'Calling user role on this plan.',
    },
    participants: {
      type: 'array',
      items: { $ref: 'InternalPlanDetailParticipant#' },
      description: 'All participants on the plan.',
    },
    items: {
      type: 'array',
      items: { $ref: 'InternalPlanDetailItem#' },
      description: 'All items on the plan.',
    },
  },
  additionalProperties: false,
} as const

export const internalPlanDetailResponseSchema = {
  $id: 'InternalPlanDetailResponse',
  type: 'object',
  description: 'Response for GET /api/internal/plans/:planId.',
  required: ['plan'],
  properties: {
    plan: { $ref: 'InternalPlanDetail#' },
  },
  additionalProperties: false,
} as const

export const internalUpdateItemStatusBodySchema = {
  $id: 'InternalUpdateItemStatusBody',
  type: 'object',
  description:
    'Chatbot status: done maps to purchased in assignmentStatusList; pending maps to pending.',
  required: ['status'],
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['done', 'pending'],
      description: 'Target status for the calling user on this item.',
    },
  },
} as const

export const internalUpdateItemStatusItemSchema = {
  $id: 'InternalUpdateItemStatusItem',
  type: 'object',
  description: 'Item snippet after status update.',
  required: ['id', 'name', 'status'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Item UUID.' },
    name: { type: 'string', description: 'Item name.' },
    status: {
      type: 'string',
      enum: ['done', 'pending'],
      description: 'Chatbot vocabulary after update.',
    },
  },
  additionalProperties: false,
} as const

export const internalUpdateItemStatusResponseSchema = {
  $id: 'InternalUpdateItemStatusResponse',
  type: 'object',
  description: 'Response for PATCH /api/internal/items/:itemId/status.',
  required: ['item'],
  properties: {
    item: { $ref: 'InternalUpdateItemStatusItem#' },
  },
  additionalProperties: false,
} as const

export const internalUpdateExpenseBodySchema = {
  $id: 'InternalUpdateExpenseBody',
  type: 'object',
  description:
    'Request body for PATCH /api/internal/expenses/:expenseId (WhatsApp/chatbot service). Authentication: `x-service-key` + `x-user-id`. The caller must own the expense (their participant is the one the expense belongs to). Send only the fields to change; omitted fields stay unchanged. `itemIds` replaces the full list — only newly added IDs advance from `pending` to `purchased`.',
  properties: {
    amount: {
      type: 'number',
      exclusiveMinimum: 0,
      description: "Updated positive expense amount in the plan's currency.",
    },
    description: {
      type: 'string',
      maxLength: 500,
      nullable: true,
      description: 'Updated free-text note. Send `null` to clear.',
    },
    itemIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      description:
        "Replaces the full item list. Every ID must exist on the expense's plan or the request fails with 400. Only newly added IDs (not already on the expense) trigger status advancement from `pending` to `purchased` for the caller's participant.",
    },
  },
  additionalProperties: false,
} as const

export const internalCreateExpenseBodySchema = {
  $id: 'InternalCreateExpenseBody',
  type: 'object',
  description:
    'Request body for POST /api/internal/plans/:planId/expenses (WhatsApp/chatbot service). Authentication: send `x-service-key` (CHATBOT_SERVICE_KEY) and `x-user-id` (Supabase user UUID for the end user). The expense is always attributed to that user’s participant row on `planId` — do not send `participantId`; it is resolved server-side. Omit `itemIds` or send `[]` to log a standalone amount; send UUIDs to link plan items. For each linked item where this participant had `pending` assignment, status becomes `purchased` after the expense is created.',
  required: ['amount'],
  properties: {
    amount: {
      type: 'number',
      exclusiveMinimum: 0,
      description:
        'Positive expense amount in the plan’s currency (same semantics as the public create-expense API).',
    },
    description: {
      type: 'string',
      maxLength: 500,
      description:
        'Optional free-text note (e.g. store name, category). Omit if not needed.',
    },
    itemIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      description:
        'Optional. Item UUIDs from this plan to attach to the expense. Every ID must exist on `planId` or the request fails with 400. Duplicate IDs in the array are de-duplicated for validation. To log without items, omit this field or use `[]`. To attach or change items after creation, use the authenticated app API `PATCH /api/expenses/:expenseId` with `itemIds` (this internal route is create-only).',
    },
  },
  additionalProperties: false,
} as const
