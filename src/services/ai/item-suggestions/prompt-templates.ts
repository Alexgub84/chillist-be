import {
  EQUIPMENT_SUBCATEGORIES,
  FOOD_SUBCATEGORIES,
} from '../subcategories.js'
import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '../../../db/schema.js'

export const SYSTEM_INSTRUCTION =
  'You are helping plan a shared packing and food checklist for a group trip or event.'

export const SUBCATEGORY_GUIDANCE = [
  'Prefer these subcategory labels when assigning items (you may use a new label if nothing fits):',
  '',
  'Equipment subcategories:',
  ...EQUIPMENT_SUBCATEGORIES.map((s) => `- ${s}`),
  '',
  'Food subcategories:',
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

export const CLOSING_INSTRUCTION = [
  'Suggest practical items for this trip. Each item must use a valid category and unit from the lists above.',
  'Return between 15 and 40 items depending on trip complexity.',
  'Every item must have a short, specific "reason" explaining why it is needed for THIS particular trip.',
  'Reminder: personal_equipment quantity is ALWAYS 1 (the system handles per-person duplication).',
  'CRITICAL: Every item MUST include ALL fields: name, category, subcategory, quantity, unit, reason. Never omit any field.',
].join('\n')
