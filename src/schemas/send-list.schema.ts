export const sendListBodySchema = {
  $id: 'SendListBody',
  type: 'object',
  properties: {
    phone: {
      type: 'string',
      pattern: '^\\+[1-9]\\d{6,14}$',
      description: 'E.164 phone number to send the list to',
    },
  },
  required: ['phone'],
} as const

export const sendListResponseSchema = {
  $id: 'SendListResponse',
  type: 'object',
  properties: {
    sent: { type: 'boolean' },
    messageId: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['sent'],
} as const
