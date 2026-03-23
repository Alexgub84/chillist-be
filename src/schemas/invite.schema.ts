import {
  UNIT_VALUES,
  ITEM_CATEGORY_VALUES,
  ITEM_STATUS_VALUES,
} from '../db/schema.js'

export const inviteParamsSchema = {
  $id: 'InviteParams',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    inviteToken: { type: 'string', minLength: 1, maxLength: 64 },
  },
  required: ['planId', 'inviteToken'],
} as const

export const inviteParticipantSchema = {
  $id: 'InviteParticipant',
  type: 'object',
  properties: {
    participantId: { type: 'string', format: 'uuid' },
    displayName: { type: 'string', nullable: true },
    role: { type: 'string', enum: ['owner', 'participant', 'viewer'] },
  },
  required: ['participantId', 'role'],
} as const

export const inviteParticipantListSchema = {
  $id: 'InviteParticipantList',
  type: 'array',
  items: { $ref: 'InviteParticipant#' },
} as const

export const invitePlanResponseSchema = {
  $id: 'InvitePlanResponse',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    items: { $ref: 'ItemList#' },
    participants: { $ref: 'InviteParticipantList#' },
    myParticipantId: { type: 'string', format: 'uuid' },
    myRsvpStatus: {
      type: 'string',
      enum: ['pending', 'confirmed', 'not_sure'],
    },
    myPreferences: { $ref: 'InviteMyPreferences#' },
  },
  required: [
    'planId',
    'title',
    'status',
    'createdAt',
    'updatedAt',
    'items',
    'participants',
    'myParticipantId',
    'myRsvpStatus',
    'myPreferences',
  ],
} as const

export const inviteMyPreferencesSchema = {
  $id: 'InviteMyPreferences',
  type: 'object',
  properties: {
    adultsCount: { type: 'integer', nullable: true },
    kidsCount: { type: 'integer', nullable: true },
    foodPreferences: { type: 'string', nullable: true },
    allergies: { type: 'string', nullable: true },
    dietaryMembers: {
      oneOf: [{ $ref: 'DietaryMembersBody#' }, { type: 'null' }],
      description:
        'Per-person dietary preferences for this participant group. Null if not yet set.',
    },
    notes: { type: 'string', nullable: true },
  },
} as const

export const regenerateTokenParamsSchema = {
  $id: 'RegenerateTokenParams',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    participantId: { type: 'string', format: 'uuid' },
  },
  required: ['planId', 'participantId'],
} as const

export const regenerateTokenResponseSchema = {
  $id: 'RegenerateTokenResponse',
  type: 'object',
  properties: {
    inviteToken: { type: 'string' },
  },
  required: ['inviteToken'],
} as const

export const updateInvitePreferencesBodySchema = {
  $id: 'UpdateInvitePreferencesBody',
  type: 'object',
  properties: {
    displayName: { type: 'string', maxLength: 255, nullable: true },
    adultsCount: { type: 'integer', minimum: 0, nullable: true },
    kidsCount: { type: 'integer', minimum: 0, nullable: true },
    foodPreferences: { type: 'string', nullable: true },
    allergies: { type: 'string', nullable: true },
    dietaryMembers: {
      oneOf: [{ $ref: 'DietaryMembersBody#' }, { type: 'null' }],
      description:
        'Per-person dietary preferences. Send null to clear. Send the full members array each time — partial updates are not supported.',
    },
    notes: { type: 'string', nullable: true },
    rsvpStatus: { type: 'string', enum: ['confirmed', 'not_sure'] },
  },
} as const

export const invitePreferencesResponseSchema = {
  $id: 'InvitePreferencesResponse',
  type: 'object',
  properties: {
    participantId: { type: 'string', format: 'uuid' },
    displayName: { type: 'string', nullable: true },
    role: { type: 'string', enum: ['owner', 'participant', 'viewer'] },
    rsvpStatus: {
      type: 'string',
      enum: ['pending', 'confirmed', 'not_sure'],
    },
    adultsCount: { type: 'integer', nullable: true },
    kidsCount: { type: 'integer', nullable: true },
    foodPreferences: { type: 'string', nullable: true },
    allergies: { type: 'string', nullable: true },
    dietaryMembers: {
      oneOf: [{ $ref: 'DietaryMembersBody#' }, { type: 'null' }],
      description: 'Per-person dietary preferences after the update.',
    },
    notes: { type: 'string', nullable: true },
  },
  required: ['participantId', 'role', 'rsvpStatus'],
} as const

export const inviteItemParamsSchema = {
  $id: 'InviteItemParams',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    inviteToken: { type: 'string', minLength: 1, maxLength: 64 },
    itemId: { type: 'string', format: 'uuid' },
  },
  required: ['planId', 'inviteToken', 'itemId'],
} as const

export const createInviteItemBodySchema = {
  $id: 'CreateInviteItemBody',
  type: 'object',
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
  },
  required: ['name', 'category', 'quantity'],
} as const

export const updateInviteItemBodySchema = {
  $id: 'UpdateInviteItemBody',
  type: 'object',
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
        'Invite/guest PATCH rule: send only your own entry (participantId must be your participant) to update status or self-assign. Backend merges into the full assignment list.',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...ITEM_STATUS_VALUES] },
        },
        required: ['participantId', 'status'],
      },
    },
    unassign: {
      type: 'boolean',
      description:
        'Set true to remove your own assignment entry from this item. Cannot be combined with assignmentStatusList in the same request.',
    },
  },
} as const

export const bulkCreateInviteItemBodySchema = {
  $id: 'BulkCreateInviteItemBody',
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { $ref: 'CreateInviteItemBody#' },
      minItems: 1,
    },
  },
  required: ['items'],
} as const

export const bulkUpdateInviteItemEntrySchema = {
  $id: 'BulkUpdateInviteItemEntry',
  type: 'object',
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
        'Same invite/guest rule as single PATCH: each item may include only your own single assignment entry; backend merges into full list.',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...ITEM_STATUS_VALUES] },
        },
        required: ['participantId', 'status'],
      },
    },
    unassign: {
      type: 'boolean',
      description:
        'Bulk self-unassign helper. Set true to remove your own assignment entry. Cannot be combined with assignmentStatusList.',
    },
  },
  required: ['itemId'],
} as const

export const bulkUpdateInviteItemBodySchema = {
  $id: 'BulkUpdateInviteItemBody',
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { $ref: 'BulkUpdateInviteItemEntry#' },
      minItems: 1,
    },
  },
  required: ['items'],
} as const
