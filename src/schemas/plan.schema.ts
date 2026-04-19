import { ITEM_QUANTITY_SOURCE_VALUES } from '../db/schema.js'

const itemQuantitySourceEnumValues = [
  ...ITEM_QUANTITY_SOURCE_VALUES,
] as unknown as string[]

const itemQuantitySourceNullableEnum = [
  ...ITEM_QUANTITY_SOURCE_VALUES,
  null,
] as unknown as string[]

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
    visibility: { type: 'string', enum: ['public', 'invite_only', 'private'] },
    ownerParticipantId: { type: 'string', format: 'uuid', nullable: true },
    createdByUserId: { type: 'string', format: 'uuid', nullable: true },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    defaultLang: {
      type: 'string',
      description: 'ISO 639-1 language code for the plan UI (e.g. en, he)',
      nullable: true,
    },
    currency: {
      type: 'string',
      description: 'ISO 4217 currency code (e.g. USD, EUR, ILS)',
      nullable: true,
    },
    estimatedAdults: {
      type: 'integer',
      description: 'Estimated number of adult participants for this plan',
      nullable: true,
    },
    estimatedKids: {
      type: 'integer',
      description: 'Estimated number of child participants for this plan',
      nullable: true,
    },
    itemQuantitySource: {
      type: 'string',
      enum: itemQuantitySourceEnumValues,
      description:
        'Whether item quantities should be calculated from estimated participant counts (`estimated`) or reported individually by participants (`participant_reported`). Always present in responses: the server resolves a NULL database value to `estimated`.',
    },
    myParticipantId: {
      type: 'string',
      format: 'uuid',
      description:
        "On GET /plans only: the authenticated user's participant row id for this plan (for leave-plan and client routing without loading full participants)",
      nullable: true,
    },
    myRole: {
      type: 'string',
      enum: ['owner', 'participant', 'viewer'],
      description:
        "On GET /plans only: the authenticated user's role on this plan",
      nullable: true,
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'planId',
    'title',
    'status',
    'visibility',
    'itemQuantitySource',
    'createdAt',
    'updatedAt',
  ],
} as const

export const planListSchema = {
  $id: 'PlanList',
  type: 'array',
  items: { $ref: 'Plan#' },
} as const

export const pendingJoinRequestPreviewSchema = {
  $id: 'PendingJoinRequestPreview',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
  },
  required: ['planId', 'title'],
} as const

export const pendingJoinRequestPreviewListSchema = {
  $id: 'PendingJoinRequestPreviewList',
  type: 'array',
  items: { $ref: 'PendingJoinRequestPreview#' },
} as const

export const ownerBodySchema = {
  $id: 'OwnerBody',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    lastName: { type: 'string', minLength: 1, maxLength: 255 },
    contactPhone: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      pattern: '^\\+[1-9]\\d{6,14}$',
      description:
        'Plan owner phone number in E.164 format. Used for WhatsApp notifications (e.g. join request alerts).',
      examples: ['+972501234567', '+15551234567'],
    },
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    avatarUrl: { type: 'string' },
    contactEmail: { type: 'string', maxLength: 255 },
  },
  required: ['name', 'lastName', 'contactPhone'],
} as const

export const createPlanBodySchema = {
  $id: 'CreatePlanBody',
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', nullable: true },
    visibility: { type: 'string', enum: ['public', 'invite_only', 'private'] },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    defaultLang: {
      type: 'string',
      maxLength: 10,
      description: 'ISO 639-1 language code (e.g. en, he)',
    },
    currency: {
      type: 'string',
      maxLength: 10,
      description: 'ISO 4217 currency code (e.g. USD, EUR, ILS)',
    },
    estimatedAdults: {
      type: 'integer',
      minimum: 0,
      description: 'Estimated number of adult participants for this plan',
    },
    estimatedKids: {
      type: 'integer',
      minimum: 0,
      description: 'Estimated number of child participants for this plan',
    },
    itemQuantitySource: {
      type: 'string',
      enum: itemQuantitySourceNullableEnum,
      nullable: true,
      description:
        'Initial quantity source. Omit or send null to leave unset; responses will return `estimated` until changed via PATCH.',
    },
    owner: { $ref: 'OwnerBody#' },
    participants: {
      type: 'array',
      items: { $ref: 'CreateParticipantBody#' },
    },
  },
  required: ['title', 'owner'],
} as const

export const updatePlanBodySchema = {
  $id: 'UpdatePlanBody',
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    visibility: { type: 'string', enum: ['public', 'invite_only', 'private'] },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    defaultLang: {
      type: 'string',
      maxLength: 10,
      nullable: true,
      description: 'ISO 639-1 language code (e.g. en, he). Send null to clear.',
    },
    currency: {
      type: 'string',
      maxLength: 10,
      nullable: true,
      description:
        'ISO 4217 currency code (e.g. USD, EUR, ILS). Send null to clear.',
    },
    estimatedAdults: {
      type: 'integer',
      minimum: 0,
      nullable: true,
      description:
        'Estimated number of adult participants. Send null to clear.',
    },
    estimatedKids: {
      type: 'integer',
      minimum: 0,
      nullable: true,
      description:
        'Estimated number of child participants. Send null to clear.',
    },
    itemQuantitySource: {
      type: 'string',
      enum: itemQuantitySourceNullableEnum,
      nullable: true,
      description:
        'Switch between `estimated` (quantities derived from estimatedAdults/estimatedKids) and `participant_reported` (quantities reported by participants). Send null to reset to default (responses will return `estimated`).',
    },
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

export const planWithDetailsSchema = {
  $id: 'PlanWithDetails',
  type: 'object',
  properties: {
    planId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    visibility: { type: 'string', enum: ['public', 'invite_only', 'private'] },
    ownerParticipantId: { type: 'string', format: 'uuid', nullable: true },
    createdByUserId: { type: 'string', format: 'uuid', nullable: true },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    defaultLang: {
      type: 'string',
      description: 'ISO 639-1 language code for the plan UI (e.g. en, he)',
      nullable: true,
    },
    currency: {
      type: 'string',
      description: 'ISO 4217 currency code (e.g. USD, EUR, ILS)',
      nullable: true,
    },
    estimatedAdults: {
      type: 'integer',
      description: 'Estimated number of adult participants for this plan',
      nullable: true,
    },
    estimatedKids: {
      type: 'integer',
      description: 'Estimated number of child participants for this plan',
      nullable: true,
    },
    itemQuantitySource: {
      type: 'string',
      enum: itemQuantitySourceEnumValues,
      description:
        'Whether item quantities should be calculated from estimated participant counts (`estimated`) or reported individually by participants (`participant_reported`). Always present in responses: the server resolves a NULL database value to `estimated`.',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    items: { $ref: 'ItemList#' },
    participants: { $ref: 'ParticipantList#' },
    joinRequests: { $ref: 'JoinRequestList#' },
  },
  required: [
    'planId',
    'title',
    'status',
    'visibility',
    'itemQuantitySource',
    'createdAt',
    'updatedAt',
    'items',
    'participants',
  ],
} as const

export const planNotLoggedInResponseSchema = {
  $id: 'PlanNotLoggedInResponse',
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['not_logged_in'] },
  },
  required: ['status'],
} as const

export const planPreviewFieldsSchema = {
  $id: 'PlanPreviewFields',
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    location: {
      oneOf: [{ $ref: 'Location#' }, { type: 'null' }],
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
  },
  required: ['title'],
} as const

export const planNotParticipantResponseSchema = {
  $id: 'PlanNotParticipantResponse',
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['not_participant'] },
    preview: { $ref: 'PlanPreviewFields#' },
    joinRequest: {
      oneOf: [{ $ref: 'JoinRequest#' }, { type: 'null' }],
    },
  },
  required: ['status', 'preview', 'joinRequest'],
} as const
