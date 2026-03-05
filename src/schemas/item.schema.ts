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
    status: {
      type: 'string',
      enum: [...ITEM_STATUS_VALUES],
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
        'Per-participant assignment and status tracking. Each entry is { participantId, status }.',
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
    'status',
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
    category: { type: 'string', enum: [...ITEM_CATEGORY_VALUES] },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    status: {
      type: 'string',
      enum: [...ITEM_STATUS_VALUES],
    },
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'The full list of participant assignments for this item. To assign to all participants: send every participant with status "pending" and set isAllParticipants=true. To assign a subset: send only those participants and set isAllParticipants=false (or omit it). To leave unassigned: omit this field or send []. Owner-only on create.',
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
        'Set true when assigning to all participants (new joiners will be auto-added). Set false or omit for subset/single/no assignment. Owner-only on create.',
    },
  },
  required: ['name', 'category', 'quantity', 'status'],
} as const

export const updateItemBodySchema = {
  $id: 'UpdateItemBody',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    category: { type: 'string', enum: [...ITEM_CATEGORY_VALUES] },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    status: {
      type: 'string',
      enum: [...ITEM_STATUS_VALUES],
    },
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'Send the full desired assignment list. Owner can set any list. Non-owner can only change their own entry (update status or remove self). To toggle assign-all ON: send all participants with status "pending" + isAllParticipants=true. To toggle assign-all OFF: send [] + isAllParticipants=false. To update one status: send the full list with that entry changed.',
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
        'Set true to mark as assigned to all (new joiners auto-added). Set false to unmark. Only the plan owner can change this flag.',
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
    category: { type: 'string', enum: [...ITEM_CATEGORY_VALUES] },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    status: {
      type: 'string',
      enum: [...ITEM_STATUS_VALUES],
    },
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'Send the full desired assignment list. Same rules as single-item PATCH: owner can set any list, non-owner can only change their own entry.',
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
        'Set true to mark as assigned to all (new joiners auto-added). Set false to unmark. Owner-only.',
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
