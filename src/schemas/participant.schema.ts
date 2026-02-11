export const participantSchema = {
  $id: 'Participant',
  type: 'object',
  properties: {
    participantId: { type: 'string', format: 'uuid' },
    planId: { type: 'string', format: 'uuid' },
    displayName: { type: 'string' },
    name: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    role: { type: 'string', enum: ['owner', 'participant', 'viewer'] },
    avatarUrl: { type: 'string', nullable: true },
    contactEmail: { type: 'string', nullable: true },
    contactPhone: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'participantId',
    'planId',
    'displayName',
    'role',
    'createdAt',
    'updatedAt',
  ],
} as const

export const participantListSchema = {
  $id: 'ParticipantList',
  type: 'array',
  items: { $ref: 'Participant#' },
} as const

export const createParticipantBodySchema = {
  $id: 'CreateParticipantBody',
  type: 'object',
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    role: { type: 'string', enum: ['owner', 'participant', 'viewer'] },
    name: { type: 'string', maxLength: 255 },
    lastName: { type: 'string', maxLength: 255 },
    avatarUrl: { type: 'string' },
    contactEmail: { type: 'string', maxLength: 255 },
    contactPhone: { type: 'string', maxLength: 50 },
  },
  required: ['displayName'],
} as const

export const updateParticipantBodySchema = {
  $id: 'UpdateParticipantBody',
  type: 'object',
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    role: { type: 'string', enum: ['owner', 'participant', 'viewer'] },
    name: { type: 'string', maxLength: 255, nullable: true },
    lastName: { type: 'string', maxLength: 255, nullable: true },
    avatarUrl: { type: 'string', nullable: true },
    contactEmail: { type: 'string', maxLength: 255, nullable: true },
    contactPhone: { type: 'string', maxLength: 50, nullable: true },
  },
} as const

export const participantIdParamSchema = {
  $id: 'ParticipantIdParam',
  type: 'object',
  properties: {
    participantId: { type: 'string', format: 'uuid' },
  },
  required: ['participantId'],
} as const

export const deleteParticipantResponseSchema = {
  $id: 'DeleteParticipantResponse',
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
  },
  required: ['ok'],
} as const
