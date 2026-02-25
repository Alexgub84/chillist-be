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
    category: { type: 'string', enum: ['equipment', 'food'] },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: ['pcs', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'm', 'cm', 'pack', 'set'],
    },
    notes: { type: 'string', nullable: true },
  },
  required: ['name', 'category', 'quantity'],
} as const

export const updateInviteItemBodySchema = {
  $id: 'UpdateInviteItemBody',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    category: { type: 'string', enum: ['equipment', 'food'] },
    quantity: { type: 'integer', minimum: 1 },
    unit: {
      type: 'string',
      enum: ['pcs', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'm', 'cm', 'pack', 'set'],
    },
    status: {
      type: 'string',
      enum: ['pending', 'purchased', 'packed', 'canceled'],
    },
    notes: { type: 'string', nullable: true },
  },
} as const
