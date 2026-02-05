export const itemSchema = {
  $id: 'Item',
  type: 'object',
  properties: {
    itemId: { type: 'string', format: 'uuid' },
    planId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category: { type: 'string', enum: ['equipment', 'food'] },
    quantity: { type: 'integer' },
    unit: {
      type: 'string',
      enum: ['pcs', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'pack', 'set'],
    },
    status: {
      type: 'string',
      enum: ['pending', 'purchased', 'packed', 'canceled'],
    },
    notes: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'itemId',
    'planId',
    'name',
    'category',
    'quantity',
    'unit',
    'status',
    'createdAt',
    'updatedAt',
  ],
} as const

export const itemListSchema = {
  $id: 'ItemList',
  type: 'array',
  items: { $ref: 'Item#' },
} as const
