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
