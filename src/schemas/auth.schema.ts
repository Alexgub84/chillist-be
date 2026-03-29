export const userPreferencesSchema = {
  $id: 'UserPreferences',
  type: 'object',
  properties: {
    phone: {
      type: 'string',
      nullable: true,
      description:
        'Normalized phone number (E.164 format). Synced from Supabase via POST /auth/sync-profile.',
    },
    preferredLang: {
      type: 'string',
      nullable: true,
      enum: ['he', 'en', null],
      description:
        'Preferred UI language. null means not explicitly set — client should fall back to geo-detection.',
    },
    foodPreferences: {
      type: 'string',
      nullable: true,
      description:
        'Free-text dietary preferences, e.g. "vegetarian, no shellfish"',
    },
    allergies: {
      type: 'string',
      nullable: true,
      description: 'Free-text allergy list, e.g. "nuts, gluten, dairy"',
    },
    defaultEquipment: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description:
        'List of equipment item names the user typically brings on trips, e.g. ["tent", "sleeping bag", "headlamp"]',
    },
  },
} as const

export const profileResponseSchema = {
  $id: 'ProfileResponse',
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string' },
      },
      required: ['id', 'email', 'role'],
    },
    preferences: {
      oneOf: [{ $ref: 'UserPreferences#' }, { type: 'null' }],
      description:
        'App preferences for this user. Null if the user has never saved preferences.',
    },
  },
  required: ['user', 'preferences'],
} as const

export const updateProfileBodySchema = {
  $id: 'UpdateProfileBody',
  type: 'object',
  properties: {
    phone: {
      type: 'string',
      nullable: true,
      description:
        'Phone number. Will be normalized to E.164 format before storage. Send null to clear.',
    },
    preferredLang: {
      type: 'string',
      nullable: true,
      enum: ['he', 'en', null],
      description:
        'Preferred UI language. Send null to clear (revert to geo-detection). Allowed: he, en.',
    },
    foodPreferences: {
      type: 'string',
      nullable: true,
      description:
        'Free-text dietary preferences, e.g. "vegetarian, no shellfish". Send null to clear.',
    },
    allergies: {
      type: 'string',
      nullable: true,
      description:
        'Free-text allergy list, e.g. "nuts, gluten, dairy". Send null to clear.',
    },
    defaultEquipment: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description:
        'List of equipment item names the user typically brings. Send null to clear.',
    },
  },
} as const

export const updateProfileResponseSchema = {
  $id: 'UpdateProfileResponse',
  type: 'object',
  properties: {
    preferences: { $ref: 'UserPreferences#' },
  },
  required: ['preferences'],
} as const
