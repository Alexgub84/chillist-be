export const healthResponseSchema = {
  $id: 'HealthResponse',
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['healthy'] },
    database: { type: 'string', enum: ['connected'] },
  },
  required: ['status', 'database'],
} as const
