export const aiSuggestionItemSchema = {
  $id: 'AiSuggestionItem',
  type: 'object',
  required: ['name', 'category', 'subcategory', 'quantity', 'unit', 'reason'],
  properties: {
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
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: { $ref: 'AiSuggestionItem#' },
    },
  },
} as const
