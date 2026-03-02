export const createJoinRequestBodySchema = {
  $id: 'CreateJoinRequestBody',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    lastName: { type: 'string', minLength: 1, maxLength: 255 },
    contactPhone: { type: 'string', minLength: 1, maxLength: 50 },
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    contactEmail: { type: 'string', maxLength: 255 },
    adultsCount: { type: 'integer', minimum: 0 },
    kidsCount: { type: 'integer', minimum: 0 },
    foodPreferences: { type: 'string' },
    allergies: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['name', 'lastName', 'contactPhone'],
} as const

export const joinRequestListSchema = {
  $id: 'JoinRequestList',
  type: 'array',
  items: { $ref: 'JoinRequest#' },
} as const

export const joinRequestSchema = {
  $id: 'JoinRequest',
  type: 'object',
  properties: {
    requestId: { type: 'string', format: 'uuid' },
    planId: { type: 'string', format: 'uuid' },
    supabaseUserId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    lastName: { type: 'string' },
    contactPhone: { type: 'string' },
    contactEmail: { type: 'string', nullable: true },
    displayName: { type: 'string', nullable: true },
    adultsCount: { type: 'integer', nullable: true },
    kidsCount: { type: 'integer', nullable: true },
    foodPreferences: { type: 'string', nullable: true },
    allergies: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    status: {
      type: 'string',
      enum: ['pending', 'approved', 'rejected'],
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'requestId',
    'planId',
    'supabaseUserId',
    'name',
    'lastName',
    'contactPhone',
    'status',
    'createdAt',
    'updatedAt',
  ],
} as const
