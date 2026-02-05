export const errorResponseSchema = {
  $id: 'ErrorResponse',
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string' },
  },
  required: ['message'],
} as const

export const paginationQuerySchema = {
  $id: 'PaginationQuery',
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const

export const paginationMetaSchema = {
  $id: 'PaginationMeta',
  type: 'object',
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
  required: ['page', 'limit', 'total', 'totalPages'],
} as const
