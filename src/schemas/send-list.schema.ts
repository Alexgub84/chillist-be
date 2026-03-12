export const sendListBodySchema = {
  $id: 'SendListBody',
  title: 'SendListBody',
  description: 'Request body for sending a plan item list via WhatsApp.',
  type: 'object',
  properties: {
    phone: {
      type: 'string',
      pattern: '^\\+[1-9]\\d{6,14}$',
      description:
        'Recipient phone number in E.164 format (e.g. +972501234567). The formatted item list for the plan will be sent to this number via WhatsApp.',
      examples: ['+972501234567', '+15551234567'],
    },
  },
  required: ['phone'],
} as const

export const sendListResponseSchema = {
  $id: 'SendListResponse',
  title: 'SendListResponse',
  description: 'Response after attempting to send an item list via WhatsApp.',
  type: 'object',
  properties: {
    sent: {
      type: 'boolean',
      description:
        'Whether the WhatsApp message was successfully queued for delivery.',
    },
    messageId: {
      type: 'string',
      description:
        'Unique message ID returned by the WhatsApp provider. Present only when sent is true.',
    },
    error: {
      type: 'string',
      description:
        'Error description from the WhatsApp provider. Present only when sent is false.',
    },
  },
  required: ['sent'],
} as const
