export const participantSchema = {
  $id: 'Participant',
  type: 'object',
  properties: {
    participantId: { type: 'string', format: 'uuid' },
    planId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid', nullable: true },
    name: { type: 'string' },
    lastName: { type: 'string' },
    contactPhone: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    role: { type: 'string', enum: ['owner', 'participant', 'viewer'] },
    avatarUrl: { type: 'string', nullable: true },
    contactEmail: { type: 'string', nullable: true },
    inviteToken: { type: 'string', nullable: true },
    inviteStatus: {
      type: 'string',
      enum: ['pending', 'invited', 'accepted'],
    },
    rsvpStatus: {
      type: 'string',
      enum: ['pending', 'confirmed', 'not_sure'],
    },
    lastActivityAt: { type: 'string', format: 'date-time', nullable: true },
    adultsCount: { type: 'integer', nullable: true },
    kidsCount: { type: 'integer', nullable: true },
    foodPreferences: { type: 'string', nullable: true },
    allergies: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'participantId',
    'planId',
    'name',
    'lastName',
    'contactPhone',
    'role',
    'inviteStatus',
    'rsvpStatus',
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
    name: { type: 'string', minLength: 1, maxLength: 255 },
    lastName: { type: 'string', minLength: 1, maxLength: 255 },
    contactPhone: { type: 'string', minLength: 1, maxLength: 50 },
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    role: { type: 'string', enum: ['participant', 'viewer'] },
    avatarUrl: { type: 'string' },
    contactEmail: { type: 'string', maxLength: 255 },
    adultsCount: { type: 'integer', minimum: 0 },
    kidsCount: { type: 'integer', minimum: 0 },
    foodPreferences: { type: 'string' },
    allergies: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['name', 'lastName', 'contactPhone'],
} as const

export const updateParticipantBodySchema = {
  $id: 'UpdateParticipantBody',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    lastName: { type: 'string', minLength: 1, maxLength: 255 },
    contactPhone: { type: 'string', minLength: 1, maxLength: 50 },
    displayName: { type: 'string', maxLength: 255, nullable: true },
    role: { type: 'string', enum: ['participant', 'viewer'] },
    avatarUrl: { type: 'string', nullable: true },
    contactEmail: { type: 'string', maxLength: 255, nullable: true },
    adultsCount: { type: 'integer', minimum: 0, nullable: true },
    kidsCount: { type: 'integer', minimum: 0, nullable: true },
    foodPreferences: { type: 'string', nullable: true },
    allergies: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
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
