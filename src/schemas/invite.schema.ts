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
  },
  required: [
    'planId',
    'title',
    'status',
    'createdAt',
    'updatedAt',
    'items',
    'participants',
  ],
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
