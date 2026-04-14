export const aiSuggestionsRequestSchema = {
  $id: 'AiSuggestionsRequest',
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    categories: {
      type: 'object',
      description:
        'Map of item category → subcategories to focus on. Omit to include all categories.',
      additionalProperties: false,
      properties: {
        group_equipment: {
          type: 'array',
          items: { type: 'string' },
          description: 'Subcategories to focus on for group equipment',
        },
        personal_equipment: {
          type: 'array',
          items: { type: 'string' },
          description: 'Subcategories to focus on for personal equipment',
        },
        food: {
          type: 'array',
          items: { type: 'string' },
          description: 'Subcategories to focus on for food',
        },
      },
    },
  },
} as const

export const aiSuggestionItemSchema = {
  $id: 'AiSuggestionItem',
  type: 'object',
  required: [
    'id',
    'name',
    'category',
    'subcategory',
    'quantity',
    'unit',
    'reason',
  ],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description:
        'Unique ID of this AI suggestion row — pass as aiSuggestionId when calling bulk create to link accepted items',
    },
    name: { type: 'string' },
    category: {
      type: 'string',
      enum: ['group_equipment', 'personal_equipment', 'food'],
    },
    subcategory: { type: 'string' },
    quantity: { type: 'number', exclusiveMinimum: 0 },
    unit: {
      type: 'string',
      enum: ['pcs', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'm', 'cm', 'pack', 'set'],
    },
    reason: { type: 'string' },
  },
} as const

export const aiSuggestionsResponseSchema = {
  $id: 'AiSuggestionsResponse',
  type: 'object',
  required: ['suggestions', 'aiUsageLogId'],
  properties: {
    aiUsageLogId: {
      type: 'string',
      format: 'uuid',
      description: 'ID of the ai_usage_logs row for this generation session',
    },
    suggestions: {
      type: 'array',
      items: { $ref: 'AiSuggestionItem#' },
    },
  },
} as const
