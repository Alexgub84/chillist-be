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
        "Per-participant assignment and status tracking (replaces the old top-level status field). Each entry is { participantId, status } where status is one of: pending, purchased, packed, canceled. For non-owner responses, this array is filtered to only the requesting participant's entry.",
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
    category: { type: 'string', enum: [...ITEM_CATEGORY_VALUES] },
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
  required: ['name', 'category', 'quantity'],
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
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'Owner: send the full desired assignment list. Non-owner: send only your own entry with updated status — backend merges into the full list. To toggle assign-all ON (owner): send all participants + isAllParticipants=true. To toggle assign-all OFF (owner): send [] + isAllParticipants=false.',
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
    unassign: {
      type: 'boolean',
      description:
        'Non-owner only: set true to remove yourself from this item. Cannot be combined with assignmentStatusList.',
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
    subcategory: { type: 'string', maxLength: 255, nullable: true },
    notes: { type: 'string', nullable: true },
    assignmentStatusList: {
      type: 'array',
      description:
        'Owner: send the full desired assignment list. Non-owner: send only your own entry — backend merges. Same rules as single-item PATCH.',
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
    unassign: {
      type: 'boolean',
      description:
        'Non-owner only: set true to remove yourself from this item. Cannot be combined with assignmentStatusList.',
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
