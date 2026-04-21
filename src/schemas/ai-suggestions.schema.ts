import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../db/schema.js'

export const aiSuggestionsRequestSchema = {
  $id: 'AiSuggestionsRequest',
  type: ['object', 'null'],
  additionalProperties: false,
  description:
    'Optional hints for the single-category generation call. Omit body or pass {} for no hints.',
  properties: {
    subcategories: {
      type: 'array',
      items: { type: 'string', maxLength: 120 },
      maxItems: 20,
      description:
        'Subcategories to focus on within the requested category (e.g. ["breakfast","snacks"] for food).',
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
      enum: [...ITEM_CATEGORY_VALUES],
    },
    subcategory: { type: 'string' },
    quantity: { type: 'number', exclusiveMinimum: 0 },
    unit: {
      type: 'string',
      enum: [...UNIT_VALUES],
    },
    reason: { type: 'string' },
  },
} as const

export const aiSuggestionsResponseSchema = {
  $id: 'AiSuggestionsResponse',
  type: 'object',
  required: ['suggestions', 'aiUsageLogId', 'generationId'],
  properties: {
    suggestions: {
      type: 'array',
      items: { $ref: 'AiSuggestionItem#' },
      description:
        'Generated items for the requested category (post-filtered to match the path category).',
    },
    aiUsageLogId: {
      type: 'string',
      description:
        'ID of the ai_usage_logs row recorded for this call. Empty string if persistence failed.',
    },
    generationId: {
      type: 'string',
      format: 'uuid',
      description:
        'UUID correlating all AI calls within a single FE "Generate" click. Echoes the X-Generation-Id request header when provided, otherwise a BE-generated fallback.',
    },
  },
} as const

export const categoryParamSchema = {
  $id: 'CategoryParam',
  type: 'object',
  required: ['planId', 'category'],
  properties: {
    planId: { type: 'string', format: 'uuid' },
    category: {
      type: 'string',
      enum: [...ITEM_CATEGORY_VALUES],
      description: 'Item category to generate suggestions for.',
    },
  },
} as const
