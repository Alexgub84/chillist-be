import {
  UNIT_VALUES,
  ITEM_CATEGORY_VALUES,
  ITEM_STATUS_VALUES,
} from '../db/schema.js'

export const itemSchema = {
  $id: 'Item',
  type: 'object',
  properties: {
    itemId: { type: 'string', format: 'uuid' },
    planId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category: { type: 'string', enum: [...ITEM_CATEGORY_VALUES] },
    quantity: { type: 'integer' },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    subcategory: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    isAllParticipants: {
      type: 'boolean',
      description:
        'True when this item is assigned to all participants. When a new participant joins the plan, they are automatically added to items with this flag.',
    },
    assignmentStatusList: {
      type: 'array',
      description:
        'Per-participant assignment and status tracking (replaces the old top-level status field). Each entry is { participantId, status } where status is one of: pending, purchased, packed, canceled. Response visibility: owner/admin sees full list; non-owner sees only their own entry.',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...ITEM_STATUS_VALUES] },
        },
        required: ['participantId', 'status'],
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'itemId',
    'planId',
    'name',
    'category',
    'quantity',
    'unit',
    'isAllParticipants',
    'assignmentStatusList',
    'createdAt',
    'updatedAt',
  ],
} as const

export const itemListSchema = {
  $id: 'ItemList',
  type: 'array',
  items: { $ref: 'Item#' },
} as const

export const createItemBodySchema = {
  $id: 'CreateItemBody',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    category: {
      type: 'string',
      enum: [...ITEM_CATEGORY_VALUES, 'equipment'],
      description:
        'Item category. "equipment" is accepted as a legacy alias for "group_equipment".',
    },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'Owner-only on create. Send the full desired assignment list. Assign all: include every participant and set isAllParticipants=true. Assign subset/single: include only those participants and keep isAllParticipants=false (or omit it). Unassigned item: omit this field or send [].',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...ITEM_STATUS_VALUES] },
        },
        required: ['participantId', 'status'],
      },
    },
    isAllParticipants: {
      type: 'boolean',
      description:
        'Owner-only on create. true means this item is for all participants and new participants should be auto-added later. false (or omitted) means regular assignment list behavior.',
    },
  },
  required: ['name', 'category', 'quantity'],
} as const

export const updateItemBodySchema = {
  $id: 'UpdateItemBody',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    category: {
      type: 'string',
      enum: [...ITEM_CATEGORY_VALUES, 'equipment'],
      description:
        'Item category. "equipment" is accepted as a legacy alias for "group_equipment".',
    },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'PATCH behavior depends on caller role. Owner/admin: send the full desired list (replaces current list). Non-owner: send exactly one entry for yourself only (for status update or self-assign); backend merges it with current list. If using unassign=true, do not send assignmentStatusList.',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...ITEM_STATUS_VALUES] },
        },
        required: ['participantId', 'status'],
      },
    },
    isAllParticipants: {
      type: 'boolean',
      description:
        'Owner/admin only. true marks item as "assign to all participants" and future participants are auto-added. false removes that mode.',
    },
    unassign: {
      type: 'boolean',
      description:
        'Participant self-unassign helper. Set true to remove your own entry from assignmentStatusList. Cannot be combined with assignmentStatusList in the same request.',
    },
  },
} as const

export const itemIdParamSchema = {
  $id: 'ItemIdParam',
  type: 'object',
  properties: {
    itemId: { type: 'string', format: 'uuid' },
  },
  required: ['itemId'],
} as const

export const bulkCreateItemBodySchema = {
  $id: 'BulkCreateItemBody',
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { $ref: 'CreateItemBody#' },
      minItems: 1,
      maxItems: 100,
    },
  },
  required: ['items'],
} as const

export const bulkUpdateItemEntrySchema = {
  $id: 'BulkUpdateItemEntry',
  type: 'object',
  additionalProperties: false,
  properties: {
    itemId: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    category: {
      type: 'string',
      enum: [...ITEM_CATEGORY_VALUES, 'equipment'],
      description:
        'Item category. "equipment" is accepted as a legacy alias for "group_equipment".',
    },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'Same rules as single-item PATCH. Owner/admin sends full desired list. Non-owner sends only their own single entry; backend merges.',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...ITEM_STATUS_VALUES] },
        },
        required: ['participantId', 'status'],
      },
    },
    isAllParticipants: {
      type: 'boolean',
      description:
        'Owner/admin only. true enables assign-to-all mode; false disables it.',
    },
    unassign: {
      type: 'boolean',
      description:
        'Participant self-unassign helper for bulk PATCH. Set true to remove your own entry. Cannot be combined with assignmentStatusList.',
    },
  },
  required: ['itemId'],
} as const

export const bulkUpdateItemBodySchema = {
  $id: 'BulkUpdateItemBody',
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { $ref: 'BulkUpdateItemEntry#' },
      minItems: 1,
      maxItems: 100,
    },
  },
  required: ['items'],
} as const

export const bulkItemErrorSchema = {
  $id: 'BulkItemError',
  type: 'object',
  properties: {
    name: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['name', 'message'],
} as const

export const bulkItemResponseSchema = {
  $id: 'BulkItemResponse',
  type: 'object',
  properties: {
    items: { $ref: 'ItemList#' },
    errors: {
      type: 'array',
      items: { $ref: 'BulkItemError#' },
    },
  },
  required: ['items', 'errors'],
} as const
