import {
  GROUP_EQUIPMENT_SUBCATEGORIES,
  PERSONAL_EQUIPMENT_SUBCATEGORIES,
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
  'Reuse one of the canonical labels below verbatim (identical wording and casing in English; translated form for Hebrew/Spanish) instead of inventing a close synonym. These are the exact labels the app displays to the user.',
  'Do NOT invent near-duplicates. Use "Sleeping Gear" (not "Sleep System"), "Packs and Hydration" (not "Hydration"), "Transport and Carry" (not "Carrying and Storage"), "Serving and Tableware" (not "Cooking and Dining"), "Fresh Fruit" / "Fresh Vegetables" (not "Fresh Produce"), "Meat and Poultry" (not "Meat and Proteins"), "Sauces, Condiments, and Spreads" (not "Condiments and Spices"), "Grains and Pasta" (not "Grains and Bread"), "Alcohol and Mixers" (not "Beverages (alcoholic)"), "Spices and Seasonings" (not "Condiments and Spices").',
  'Only invent a new label when no canonical label fits (e.g. fishing trip → "Fishing Gear", ski trip → "Ski Equipment", beach day → "Water Sports").',
  '',
  'Canonical group_equipment subcategories:',
  ...GROUP_EQUIPMENT_SUBCATEGORIES.map((s) => `- ${s}`),
  '',
  'Canonical personal_equipment subcategories:',
  ...PERSONAL_EQUIPMENT_SUBCATEGORIES.map((s) => `- ${s}`),
  '',
  'Canonical food subcategories:',
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

export const ITEM_ATOMICITY_RULE = [
  'Item atomicity — one row = one distinct product:',
  '- Each "name" must describe a SINGLE product (or a single set sold as one unit, e.g. "First Aid Kit", "Cookware Set").',
  '- NEVER combine two different products using "and" or commas in the name. Bad examples: "Hat and Gloves", "Cheese and Bread", "Coffee and Tea", "Salt and Pepper", "Onion and Garlic", "Nuts and Dried Fruit Mix", "Notepad and Pen", "Camp Plate and Utensil Set", "Warm Hat and Gloves".',
  '- If two products are usually used together, emit TWO rows — one for each. Example: instead of "Hat and Gloves" → one row named "Hat", one row named "Gloves". Instead of "Coffee and Tea" → one row "Coffee", one row "Tea". Instead of "Notepad and Pen" → one row "Notepad", one row "Pen".',
  '- NEVER use "A or B" phrasing inside the name. Pick the single most likely product for this trip and emit that name. If two alternatives both genuinely matter, emit TWO separate rows. Bad examples: "Sleeping Pad or Foam Mat", "Headlamp or Flashlight", "Water Bottle or Hydration Reservoir", "Milk or Powdered Milk", "Hat or Cap", "Chicken Breasts or Ground Meat", "Long Pants or Leggings", "Cereal or Muesli".',
  '- Genuine packaged sets are acceptable as one name when they ship in one box and the user buys them together: e.g. "First Aid Kit", "Cookware Set", "Tent Stakes and Mallet".',
].join('\n')

export const ITEM_NAMING_RULE = [
  'Item naming style — write each name like a product label on a store shelf:',
  '- Use Title Case for every significant word, in every language. Good: "Sleeping Bag", "First Aid Kit", "Red Wine", "Vegan Protein Pasta". Bad: "vegan protein pasta", "red wine", "fresh spinach".',
  '- Keep names short, ideally 1-3 words (up to 4 only for genuine compound products like "First Aid Kit" or "Aloe Vera Gel"). Long descriptions and scenario context belong in the "reason" field, NEVER in the name.',
  '- Use the simplest common name shoppers and packers already recognize. Prefer the generic canonical product name over a qualified variant unless the variant truly identifies a different product. Good: "Tent" (not "Camping Tent"), "Umbrella" (not "Compact Umbrella"), "Sunscreen" (not "Sunscreen (High SPF)"), "Sleeping Bag" (not "Sleeping Bag (Summer/3-Season)").',
  '- NEVER put parenthetical descriptors in the name — no seasons, ratings, SPF levels, brands, materials, ingredient lists, or variety options inside parentheses. Put that nuance in the "reason" field. Bad: "Sleeping Bag (Summer/3-Season)", "Sunscreen (High SPF)", "Warm Socks (Wool or Synthetic Blend)", "Personal Toiletries Bag (Toothbrush, Toothpaste, Soap)", "Vegetables (Onions, Carrots, Potatoes)", "Cereal (Oatmeal or Granola)", "Bread (crusty baguette or focaccia)", "Vegan dessert (chocolate mousse or sorbet)". Good: "Sleeping Bag", "Sunscreen", "Wool Socks", "Toothbrush" + "Toothpaste" + "Soap" as separate rows, "Onions" + "Carrots" + "Potatoes" as separate rows.',
  '- Avoid vague qualifier words like "Warm", "Thin", "Light" in the name when you mean a specific product. Name the product directly. Good: "Fleece Jacket" or "Rain Jacket" (not "Warm Jacket"), "Base Layer" (not "Thin Base Layer Top"), "Beanie" (not "Warm Hat"). If you genuinely mean the generic item, drop the adjective: "Hat", "Jacket".',
  '- Never prefix trip-specific adjectives onto a canonical item name. Bad: "Camping Tent", "Hiking Water Bottle", "Beach Sunscreen". Good: "Tent", "Water Bottle", "Sunscreen".',
  '- Do not list contents or a bag in the name. Bad: "Personal Toiletries Bag", "First Aid Bag" (as a container of unspecified stuff). Good: split into concrete products ("Toothbrush", "Toothpaste", "Soap") or use the genuine kit name ("First Aid Kit").',
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

  const activeCategories = categoryNames.filter(
    ([, subs]) => subs !== undefined
  )
  if (activeCategories.length === 1) {
    const [targetCat] = activeCategories[0]!
    const bleedExample =
      targetCat === 'group_equipment'
        ? 'a sleeping bag, headlamp, or sunscreen (those are personal_equipment — each person needs their own copy)'
        : targetCat === 'personal_equipment'
          ? 'a tent, cooler, or camp stove (those are group_equipment — the whole group shares one)'
          : 'a tent or sleeping bag (those are group_equipment or personal_equipment, not food)'
    lines.push(
      '',
      `SINGLE-CATEGORY MODE — HARD RULE:`,
      `- You MUST set category="${targetCat}" on EVERY single item in your output. No exceptions.`,
      `- Do NOT include any items with any other category value. If you are tempted to suggest ${bleedExample}, skip it completely — it belongs to a separate call.`,
      `- The server will DISCARD every item whose category does not equal "${targetCat}". Items you wrongly categorize waste your token budget and reduce the useful size of the response.`
    )
  }

  return lines.join('\n')
}

export function getClosingInstruction(categoryCount: number = 3): string {
  const { min, max } =
    categoryCount >= 3
      ? { min: 15, max: 40 }
      : categoryCount === 2
        ? { min: 10, max: 25 }
        : { min: 5, max: 20 }

  return [
    'Suggest practical items for this trip. Each item must use a valid category and unit from the lists above.',
    `Return between ${min} and ${max} items depending on trip complexity.`,
    'Every item must have a short, specific "reason" explaining why it is needed for THIS particular trip.',
    'Reminder: personal_equipment quantity is ALWAYS 1 (the system handles per-person duplication).',
    'Naming reminder: Title Case, short canonical name, no parenthetical descriptors, no "and"/"or" alternatives in the name. Trip context goes in "reason", not in the name.',
    'Subcategory reminder: reuse an example label verbatim whenever it fits; only invent a new label for genuinely new groupings.',
    'CRITICAL: Every item MUST include ALL fields: name, category, subcategory, quantity, unit, reason. Never omit any field.',
  ].join('\n')
}

export const CLOSING_INSTRUCTION = getClosingInstruction(3)
