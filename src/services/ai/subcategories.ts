// Subcategory label arrays for the AI prompt.
//
// These are an EXACT mirror of chillist-fe/src/data/subcategories.ts.
// The FE sends the full list for the requested category on every AI call —
// keeping both files in sync means the AI's background guidance and the
// per-request instruction use the same vocabulary.
//
// When the FE adds, renames, or removes a subcategory, update this file too.

export const GROUP_EQUIPMENT_SUBCATEGORIES = [
  'Venue Setup and Layout',
  'Food Preparation Tools',
  'Cooking and Heating Equipment',
  'Cookware and Bakeware',
  'Serving and Tableware',
  'Drink and Beverage Equipment',
  'Food Storage and Cooling',
  'Cleaning and Dishwashing',
  'Waste and Recycling',
  'Power and Charging',
  'Lighting and Visibility',
  'Comfort and Climate Control',
  'Music and Media',
  'Games and Activities',
  'Kids and Baby Gear',
  'Pet Gear',
  'Hygiene and Bathroom Supplies',
  'First Aid and Safety',
  'Transport and Carry',
  'Documentation and Access',
  'Tools and Quick Repairs',
] as const

export const PERSONAL_EQUIPMENT_SUBCATEGORIES = [
  'Sleeping Gear',
  'Clothing and Layers',
  'Footwear',
  'Headwear and Accessories',
  'Hygiene and Toiletries',
  'Packs and Hydration',
  'Kids Gear',
  'Personal Essentials',
] as const

export const FOOD_SUBCATEGORIES = [
  'Fresh Vegetables',
  'Fresh Fruit',
  'Fresh Herbs',
  'Leafy Greens and Salads',
  'Aromatics (onion, garlic, ginger)',
  'Meat and Poultry',
  'Fish and Seafood',
  'Meat Alternatives and Plant Proteins',
  'Vegan',
  'Eggs',
  'Dairy',
  'Dairy Alternatives',
  'Cheese',
  'Bread and Bakery',
  'Grains and Pasta',
  'Breakfast Staples',
  'Legumes (dry and canned)',
  'Canned and Jarred Foods',
  'Sauces, Condiments, and Spreads',
  'Oils, Vinegars, and Dressings',
  'Spices and Seasonings',
  'Baking Ingredients',
  'Snacks and Chips',
  'Nuts, Seeds, and Dried Fruit',
  'Sweets and Desserts',
  'Frozen Foods',
  'Ready-to-Eat and Prepared Foods',
  'Beverages (non-alcoholic)',
  'Alcohol and Mixers',
  'Hot Drinks (coffee, tea, cocoa)',
  'Water and Ice',
] as const

// Legacy alias — kept so existing imports compile without change.
// Points to group_equipment subcategories; prefer GROUP_EQUIPMENT_SUBCATEGORIES
// for clarity in new code.
export const EQUIPMENT_SUBCATEGORIES = GROUP_EQUIPMENT_SUBCATEGORIES
