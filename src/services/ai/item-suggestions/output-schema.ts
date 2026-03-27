import { z } from 'zod'
import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../../../db/schema.js'

export const itemSuggestionSchema = z.object({
  name: z.string().describe('Item name'),
  category: z
    .enum(ITEM_CATEGORY_VALUES)
    .describe('group_equipment, personal_equipment, or food'),
  subcategory: z.string().describe('Subcategory label from the preferred list'),
  quantity: z
    .number()
    .positive()
    .describe(
      'How many to bring (whole numbers preferred, decimals allowed for weight/volume)'
    ),
  unit: z.enum(UNIT_VALUES).describe('Unit of measurement'),
  reason: z.string().describe('Why this item is suggested for this trip'),
})

export type ItemSuggestion = z.infer<typeof itemSuggestionSchema>
