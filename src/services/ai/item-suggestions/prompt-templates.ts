import {
  EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
} from '../subcategories.js'
import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../../../db/schema.js'

export const SUPPORTED_AI_LANGS = ['en', 'he', 'es'] as const
export type SupportedAiLang = (typeof SUPPORTED_AI_LANGS)[number]

export function resolveAiLang(
  defaultLang: string | null | undefined
): SupportedAiLang {
  if (defaultLang === 'he') return 'he'
  if (defaultLang === 'es') return 'es'
  return 'en'
}

export function getLanguageInstruction(lang: SupportedAiLang): string {
  switch (lang) {
    case 'he':
      return [
        'Output language: Hebrew (עברית) for item name, subcategory, and reason.',
        'Category and unit MUST stay exactly as the English enum values listed later (never translate category or unit).',
        'Write in natural, correct Hebrew. Do not invent fake Hebrew words.',
        'Do not mix scripts (no Latin, Arabic, or other non-Hebrew characters in Hebrew text).',
        'If you are unsure how to say something in Hebrew, use a common loanword or describe it plainly.',
      ].join(' ')
    case 'es':
      return [
        'Output language: Spanish (Español) for item name, subcategory, and reason.',
        'Category and unit MUST stay exactly as the English enum values listed later (never translate category or unit).',
      ].join(' ')
    default:
      return 'Output language: generate every item name, subcategory label, and reason in English. The category and unit fields MUST stay exactly as the English enum values listed below.'
  }
}

export const SYSTEM_INSTRUCTION =
  'You are helping plan a shared packing and food checklist for a group trip or event.'

export function getDietaryInstruction(dietarySummary: string): string {
  return [
    'Dietary needs:',
    dietarySummary,
    'Include appropriate food options and label restrictions clearly (name, subcategory, or reason).',
    'Respect all dietary restrictions when suggesting food items.',
  ].join(' ')
}

export const SUBCATEGORY_GUIDANCE = [
  'Subcategory guidance:',
  'Aim for 4-8 distinct subcategory labels total. Too many subcategories fragments the list — group related items under broader labels.',
  'Use the subcategory examples below as inspiration — they are not an exhaustive list.',
  'Create subcategories that best fit this plan and its activities (e.g. fishing trip → "Fishing Gear", ski trip → "Ski Equipment", beach day → "Water Sports").',
  'You are encouraged to invent new subcategory labels when the plan needs a grouping that does not match any example.',
  '',
  'Example equipment subcategories:',
  ...EQUIPMENT_SUBCATEGORIES.map((s) => `- ${s}`),
  '',
  'Example food subcategories:',
  ...FOOD_SUBCATEGORIES.map((s) => `- ${s}`),
].join('\n')

export const VALID_ENUMS = [
  `Valid categories: ${ITEM_CATEGORY_VALUES.join(', ')}.`,
  `Valid units: ${UNIT_VALUES.join(', ')}.`,
].join('\n')

export const CONTEXT_GUIDANCE = [
  'How to use the context above:',
  '',
  '- Duration: 0 nights = day trip (no sleeping gear, minimal food). 1+ nights = include sleeping and comfort gear. Scale food quantities proportionally to the number of nights.',
  '',
  '- Location: factor in climate, terrain, and remoteness. Beach trips need sun protection; mountain trips need warm layers; remote areas need more self-sufficiency.',
  '',
  '- Tags + Duration combined: tags describe activities AND accommodation. Use them together to decide what gear is needed:',
  '  - Tags like "hotel", "hostel", "airbnb", "cabin" mean indoor accommodation is provided — do NOT suggest sleeping bags, tents, mattresses, or shelter gear.',
  '  - Tags like "camping", "wild camping", "bivouac" mean outdoor sleeping — include tents, sleeping bags, sleeping pads, and lighting.',
  '  - Tags like "hiking", "trekking" → hiking boots, daypack, trail snacks, water bottles, first aid.',
  '  - Tags like "fishing" → fishing rod, tackle box, cooler, bait.',
  '  - Tags like "cooking", "bbq", "grill" → full cooking setup, charcoal/gas, utensils, cleaning supplies.',
  '  - Tags like "beach", "swimming" → towels, sunscreen, swimwear, umbrella, cooler.',
  '  - Tags like "skiing", "snow" → warm layers, goggles, gloves, thermos.',
  '  - If no tags suggest accommodation type but nights > 0, assume outdoor camping and include sleeping gear.',
  '',
  '- Group size: scale quantities to the number of people. Kid-specific items when kids > 0 (e.g. child-size sleeping bag, snacks kids like, baby wipes). If group size is not specified, suggest for a small group of ~4 adults.',
].join('\n')

export const CATEGORY_RULES = [
  'Category rules — choose the correct category for each item:',
  '- "group_equipment": shared items the group needs ONE of (tent, cooler, first aid kit, camp stove, table, lantern). Quantity = how many the group needs total.',
  '- "personal_equipment": items each person needs their OWN copy of (sleeping bag, headlamp, plate, cup, toothbrush, sunscreen, backpack).',
  '  IMPORTANT: For personal_equipment, ALWAYS set quantity to exactly 1. The system automatically assigns one copy to every participant. Do NOT multiply by group size.',
  '- "food": food and drinks for the group. Quantity = total amount for the whole group scaled by group size and trip duration. Decimals are fine for weight/volume (e.g. 0.5 kg, 1.5 l).',
].join('\n')

export function getCategoriesInstruction(categories: {
  group_equipment?: string[]
  personal_equipment?: string[]
  food?: string[]
}): string {
  const lines: string[] = [
    'Requested categories and subcategories:',
    'Generate items ONLY for the following categories. Do not suggest items from any unlisted category.',
  ]

  const categoryNames: Array<[string, string[] | undefined]> = [
    ['group_equipment', categories.group_equipment],
    ['personal_equipment', categories.personal_equipment],
    ['food', categories.food],
  ]

  for (const [cat, subs] of categoryNames) {
    if (!subs) continue
    if (subs.length === 0) {
      lines.push(`- ${cat}: any subcategory`)
    } else {
      lines.push(`- ${cat}: ${subs.join(', ')}`)
    }
  }

  lines.push(
    'Keep subcategory labels as close as possible to the ones listed above.'
  )

  return lines.join('\n')
}

export const CLOSING_INSTRUCTION = [
  'Suggest practical items for this trip. Each item must use a valid category and unit from the lists above.',
  'Return between 15 and 40 items depending on trip complexity.',
  'Every item must have a short, specific "reason" explaining why it is needed for THIS particular trip.',
  'Reminder: personal_equipment quantity is ALWAYS 1 (the system handles per-person duplication).',
  'CRITICAL: Every item MUST include ALL fields: name, category, subcategory, quantity, unit, reason. Never omit any field.',
].join('\n')
