export const sendListBodySchema = {
  $id: 'SendListBody',
  title: 'SendListBody',
  description:
    'Request body for sending a plan item list via WhatsApp. ' +
    'Use "recipient" to choose who receives the list and "listType" to filter items.',
  type: 'object',
  properties: {
    recipient: {
      type: 'string',
      description:
        'Who should receive the list. ' +
        '"self" sends to the caller\'s own phone. ' +
        '"all" sends to every non-owner participant (owner-only). ' +
        'A specific participantId sends to that participant.',
      examples: ['self', 'all', '550e8400-e29b-41d4-a716-446655440000'],
    },
    listType: {
      type: 'string',
      enum: ['full', 'buying', 'packing', 'unassigned'],
      default: 'full',
      description:
        'Which items to include. ' +
        '"full" = all items, "buying" = pending assignments, ' +
        '"packing" = purchased assignments, "unassigned" = no assignments.',
    },
  },
  required: ['recipient'],
} as const

export const sendListResponseSchema = {
  $id: 'SendListResponse',
  title: 'SendListResponse',
  description:
    'Unified response after attempting to send an item list via WhatsApp.',
  type: 'object',
  properties: {
    total: {
      type: 'number',
      description: 'Total number of recipients targeted.',
    },
    sent: {
      type: 'number',
      description: 'Number of messages successfully queued for delivery.',
    },
    failed: {
      type: 'number',
      description: 'Number of messages that failed to send.',
    },
    results: {
      type: 'array',
      description: 'Per-recipient send result.',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string' },
          phone: { type: 'string' },
          sent: { type: 'boolean' },
          messageId: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['participantId', 'phone', 'sent'],
      },
    },
  },
  required: ['total', 'sent', 'failed', 'results'],
} as const
