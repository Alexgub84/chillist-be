export const locationSchema = {
  $id: 'Location',
  type: 'object',
  properties: {
    locationId: { type: 'string' },
    name: { type: 'string' },
    country: { type: 'string', nullable: true },
    region: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    latitude: { type: 'number', nullable: true },
    longitude: { type: 'number', nullable: true },
    timezone: { type: 'string', nullable: true },
  },
  required: ['locationId', 'name'],
} as const

export const planSchema = {
  $id: 'Plan',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
    ownerParticipantId: { type: 'string', format: 'uuid', nullable: true },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'planId',
    'title',
    'status',
    'visibility',
    'createdAt',
    'updatedAt',
  ],
} as const

export const planListSchema = {
  $id: 'PlanList',
  type: 'array',
  items: { $ref: 'Plan#' },
} as const

export const createPlanBodySchema = {
  $id: 'CreatePlanBody',
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', nullable: true },
    visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
  },
  required: ['title'],
} as const

export const updatePlanBodySchema = {
  $id: 'UpdatePlanBody',
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
  },
} as const

export const planIdParamSchema = {
  $id: 'PlanIdParam',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
  },
  required: ['planId'],
} as const

export const deletePlanResponseSchema = {
  $id: 'DeletePlanResponse',
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
  },
  required: ['ok'],
} as const

export const planWithItemsSchema = {
  $id: 'PlanWithItems',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
    ownerParticipantId: { type: 'string', format: 'uuid', nullable: true },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    items: { $ref: 'ItemList#' },
  },
  required: [
    'planId',
    'title',
    'status',
    'visibility',
    'createdAt',
    'updatedAt',
    'items',
  ],
} as const
