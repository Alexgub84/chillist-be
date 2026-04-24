import { DIET_TYPE_VALUES, ALLERGY_TYPE_VALUES } from '../db/schema.js'

export const dietaryMemberSchema = {
  $id: 'DietaryMember',
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['adult', 'kid'],
      description: 'Whether this group member is an adult or a kid',
    },
    index: {
      type: 'integer',
      minimum: 0,
      description:
        '0-based index within the member type (adult 0, adult 1, kid 0, etc.)',
    },
    diets: {
      type: 'array',
      items: { type: 'string', enum: [...DIET_TYPE_VALUES] },
      minItems: 1,
      uniqueItems: true,
      description: 'One or more food preference tags for this person',
    },
    allergies: {
      type: 'array',
      items: { type: 'string', enum: [...ALLERGY_TYPE_VALUES] },
      description:
        'List of allergies for this person. Use ["none"] or [] for no allergies.',
    },
  },
  required: ['type', 'index', 'diets', 'allergies'],
} as const

export const dietaryMembersBodySchema = {
  $id: 'DietaryMembersBody',
  type: 'object',
  properties: {
    members: {
      type: 'array',
      items: { $ref: 'DietaryMember#' },
      description:
        'Per-person dietary data for each adult/kid in this participant group. Each entry has a type (adult|kid), a 0-based index within that type, a single diet preference, and an allergies list.',
    },
  },
  required: ['members'],
} as const
