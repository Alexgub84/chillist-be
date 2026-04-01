import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  unique,
  boolean,
  numeric,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const guestProfiles = pgTable('guest_profiles', {
  guestId: uuid('guest_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  foodPreferences: text('food_preferences'),
  allergies: text('allergies'),
  adultsCount: integer('adults_count'),
  kidsCount: integer('kids_count'),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const PREFERRED_LANG_VALUES = ['he', 'en'] as const
export type PreferredLang = (typeof PREFERRED_LANG_VALUES)[number]

export const users = pgTable(
  'users',
  {
    userId: uuid('user_id').primaryKey(),
    phone: varchar('phone', { length: 50 }),
    preferredLang: varchar('preferred_lang', { length: 10 }),
    foodPreferences: text('food_preferences'),
    allergies: text('allergies'),
    defaultEquipment: jsonb('default_equipment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('users_phone_idx').on(table.phone)]
)

export const planStatusEnum = pgEnum('plan_status', [
  'draft',
  'active',
  'archived',
])
export const visibilityEnum = pgEnum('visibility', [
  'public',
  'invite_only',
  'private',
])
export const participantRoleEnum = pgEnum('participant_role', [
  'owner',
  'participant',
  'viewer',
])
export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'invited',
  'accepted',
])
export const rsvpStatusEnum = pgEnum('rsvp_status', [
  'pending',
  'confirmed',
  'not_sure',
])
export const joinRequestStatusEnum = pgEnum('join_request_status', [
  'pending',
  'approved',
  'rejected',
])
export const itemCategoryEnum = pgEnum('item_category', [
  'group_equipment',
  'personal_equipment',
  'food',
])
export const ITEM_CATEGORY_VALUES = itemCategoryEnum.enumValues
export type ItemCategory = (typeof ITEM_CATEGORY_VALUES)[number]

export const itemStatusEnum = pgEnum('item_status', [
  'pending',
  'purchased',
  'packed',
  'canceled',
])
export const ITEM_STATUS_VALUES = itemStatusEnum.enumValues
export type ItemStatus = (typeof ITEM_STATUS_VALUES)[number]

export const itemChangeTypeEnum = pgEnum('item_change_type', [
  'created',
  'updated',
])

export const aiFeatureTypeEnum = pgEnum('ai_feature_type', ['item_suggestions'])
export const AI_FEATURE_TYPE_VALUES = aiFeatureTypeEnum.enumValues
export type AiFeatureType = (typeof AI_FEATURE_TYPE_VALUES)[number]

export const aiUsageStatusEnum = pgEnum('ai_usage_status', [
  'success',
  'partial',
  'error',
])
export const unitEnum = pgEnum('unit', [
  'pcs',
  'kg',
  'g',
  'lb',
  'oz',
  'l',
  'ml',
  'm',
  'cm',
  'pack',
  'set',
])
export const UNIT_VALUES = unitEnum.enumValues
export type Unit = (typeof UNIT_VALUES)[number]

export type Location = {
  locationId: string
  name: string
  country?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
  timezone?: string
}

export const DIET_TYPE_VALUES = [
  'everything',
  'vegetarian',
  'vegan',
  'pescatarian',
  'kosher',
  'halal',
  'gluten_free',
  'dairy_free',
  'keto',
  'paleo',
] as const
export type DietType = (typeof DIET_TYPE_VALUES)[number]

export const ALLERGY_TYPE_VALUES = [
  'none',
  'nuts',
  'peanuts',
  'gluten',
  'dairy',
  'eggs',
  'soy',
  'shellfish',
  'sesame',
  'fish',
] as const
export type AllergyType = (typeof ALLERGY_TYPE_VALUES)[number]

export type DietaryMember = {
  type: 'adult' | 'kid'
  index: number
  diet: DietType
  allergies: AllergyType[]
}

export type DietaryMembers = {
  members: DietaryMember[]
}

export const plans = pgTable('plans', {
  planId: uuid('plan_id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: planStatusEnum('status').default('draft').notNull(),
  visibility: visibilityEnum('visibility').default('public').notNull(),
  ownerParticipantId: uuid('owner_participant_id'),
  createdByUserId: uuid('created_by_user_id'),
  location: jsonb('location').$type<Location>(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  tags: text('tags').array(),
  defaultLang: varchar('default_lang', { length: 10 }),
  currency: varchar('currency', { length: 10 }),
  estimatedAdults: integer('estimated_adults'),
  estimatedKids: integer('estimated_kids'),
  aiGenerationCount: integer('ai_generation_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const participants = pgTable('participants', {
  participantId: uuid('participant_id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.planId, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  guestProfileId: uuid('guest_profile_id').references(
    () => guestProfiles.guestId,
    { onDelete: 'set null' }
  ),
  name: varchar('name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  role: participantRoleEnum('role').default('participant').notNull(),
  avatarUrl: text('avatar_url'),
  contactEmail: varchar('contact_email', { length: 255 }),
  inviteToken: varchar('invite_token', { length: 64 }).unique(),
  inviteStatus: inviteStatusEnum('invite_status').default('pending').notNull(),
  adultsCount: integer('adults_count'),
  kidsCount: integer('kids_count'),
  foodPreferences: text('food_preferences'),
  allergies: text('allergies'),
  dietaryMembers: jsonb('dietary_members').$type<DietaryMembers>(),
  notes: text('notes'),
  rsvpStatus: rsvpStatusEnum('rsvp_status').default('pending').notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const items = pgTable('items', {
  itemId: uuid('item_id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.planId, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  category: itemCategoryEnum('category').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unit: unitEnum('unit').default('pcs').notNull(),
  subcategory: varchar('subcategory', { length: 255 }),
  notes: text('notes'),
  isAllParticipants: boolean('is_all_participants').default(false).notNull(),
  assignmentStatusList: jsonb('assignment_status_list')
    .notNull()
    .$type<Array<{ participantId: string; status: ItemStatus }>>()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const itemChanges = pgTable('item_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id')
    .notNull()
    .references(() => items.itemId, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull(),
  changeType: itemChangeTypeEnum('change_type').notNull(),
  changes: jsonb('changes').notNull(),
  changedByUserId: uuid('changed_by_user_id'),
  changedByParticipantId: uuid('changed_by_participant_id'),
  sessionId: uuid('session_id'),
  changedAt: timestamp('changed_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const inviteSendStatusEnum = pgEnum('invite_send_status', [
  'pending',
  'sent',
  'failed',
  'accepted',
])

export const planInvites = pgTable('plan_invites', {
  inviteId: uuid('invite_id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.planId, { onDelete: 'cascade' }),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.participantId, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  status: inviteSendStatusEnum('status').default('pending').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedByUserId: uuid('accepted_by_user_id'),
  sessionId: uuid('session_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const participantJoinRequests = pgTable(
  'participant_join_requests',
  {
    requestId: uuid('request_id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.planId, { onDelete: 'cascade' }),
    supabaseUserId: uuid('supabase_user_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
    contactEmail: varchar('contact_email', { length: 255 }),
    displayName: varchar('display_name', { length: 255 }),
    adultsCount: integer('adults_count'),
    kidsCount: integer('kids_count'),
    foodPreferences: text('food_preferences'),
    allergies: text('allergies'),
    dietaryMembers: jsonb('dietary_members').$type<DietaryMembers>(),
    notes: text('notes'),
    status: joinRequestStatusEnum('status').default('pending').notNull(),
    sessionId: uuid('session_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('join_request_plan_user_unique').on(
      table.planId,
      table.supabaseUserId
    ),
  ]
)

export const whatsappNotificationTypeEnum = pgEnum(
  'whatsapp_notification_type',
  [
    'invitation_sent',
    'join_request_pending',
    'join_request_approved',
    'join_request_rejected',
  ]
)

export const whatsappNotificationStatusEnum = pgEnum(
  'whatsapp_notification_status',
  ['sent', 'failed']
)

export const whatsappNotifications = pgTable('whatsapp_notifications', {
  notificationId: uuid('notification_id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.planId, { onDelete: 'cascade' }),
  recipientPhone: varchar('recipient_phone', { length: 50 }).notNull(),
  recipientParticipantId: uuid('recipient_participant_id').references(
    () => participants.participantId,
    { onDelete: 'set null' }
  ),
  type: whatsappNotificationTypeEnum('type').notNull(),
  status: whatsappNotificationStatusEnum('status').notNull(),
  messageId: varchar('message_id', { length: 255 }),
  error: text('error'),
  sessionId: uuid('session_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const participantExpenses = pgTable('participant_expenses', {
  expenseId: uuid('expense_id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.participantId, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.planId, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description'),
  itemIds: jsonb('item_ids').$type<string[]>().notNull().default([]),
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  featureType: aiFeatureTypeEnum('feature_type').notNull(),
  planId: uuid('plan_id').references(() => plans.planId, {
    onDelete: 'set null',
  }),
  userId: uuid('user_id'),
  sessionId: uuid('session_id'),
  provider: varchar('provider', { length: 50 }).notNull(),
  modelId: varchar('model_id', { length: 100 }).notNull(),
  lang: varchar('lang', { length: 10 }),
  status: aiUsageStatusEnum('status').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 6 }),
  durationMs: integer('duration_ms').notNull(),
  promptLength: integer('prompt_length'),
  promptText: text('prompt_text'),
  resultCount: integer('result_count'),
  errorMessage: text('error_message'),
  errorType: text('error_type'),
  finishReason: varchar('finish_reason', { length: 50 }),
  rawResponseText: text('raw_response_text'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const deviceTypeEnum = pgEnum('device_type', [
  'mobile',
  'tablet',
  'desktop',
])
export const DEVICE_TYPE_VALUES = deviceTypeEnum.enumValues
export type DeviceType = (typeof DEVICE_TYPE_VALUES)[number]

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id'),
    deviceType: deviceTypeEnum('device_type').notNull(),
    userAgent: text('user_agent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)]
)

export const sessionsRelations = relations(sessions, () => ({}))

export const guestProfilesRelations = relations(guestProfiles, ({ many }) => ({
  participants: many(participants),
}))

export const plansRelations = relations(plans, ({ many }) => ({
  items: many(items),
  participants: many(participants),
  invites: many(planInvites),
  joinRequests: many(participantJoinRequests),
  expenses: many(participantExpenses),
  whatsappNotifications: many(whatsappNotifications),
  aiUsageLogs: many(aiUsageLogs),
}))

export const itemsRelations = relations(items, ({ one, many }) => ({
  plan: one(plans, {
    fields: [items.planId],
    references: [plans.planId],
  }),
  changes: many(itemChanges),
}))

export const itemChangesRelations = relations(itemChanges, ({ one }) => ({
  item: one(items, {
    fields: [itemChanges.itemId],
    references: [items.itemId],
  }),
}))

export const participantsRelations = relations(
  participants,
  ({ one, many }) => ({
    plan: one(plans, {
      fields: [participants.planId],
      references: [plans.planId],
    }),
    guestProfile: one(guestProfiles, {
      fields: [participants.guestProfileId],
      references: [guestProfiles.guestId],
    }),
    invite: one(planInvites),
    expenses: many(participantExpenses),
  })
)

export const planInvitesRelations = relations(planInvites, ({ one }) => ({
  plan: one(plans, {
    fields: [planInvites.planId],
    references: [plans.planId],
  }),
  participant: one(participants, {
    fields: [planInvites.participantId],
    references: [participants.participantId],
  }),
}))

export const participantJoinRequestsRelations = relations(
  participantJoinRequests,
  ({ one }) => ({
    plan: one(plans, {
      fields: [participantJoinRequests.planId],
      references: [plans.planId],
    }),
  })
)

export const participantExpensesRelations = relations(
  participantExpenses,
  ({ one }) => ({
    participant: one(participants, {
      fields: [participantExpenses.participantId],
      references: [participants.participantId],
    }),
    plan: one(plans, {
      fields: [participantExpenses.planId],
      references: [plans.planId],
    }),
  })
)

export const whatsappNotificationsRelations = relations(
  whatsappNotifications,
  ({ one }) => ({
    plan: one(plans, {
      fields: [whatsappNotifications.planId],
      references: [plans.planId],
    }),
    recipientParticipant: one(participants, {
      fields: [whatsappNotifications.recipientParticipantId],
      references: [participants.participantId],
    }),
  })
)

export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  plan: one(plans, {
    fields: [aiUsageLogs.planId],
    references: [plans.planId],
  }),
}))

export type GuestProfile = typeof guestProfiles.$inferSelect
export type NewGuestProfile = typeof guestProfiles.$inferInsert
export type UserRecord = typeof users.$inferSelect
export type NewUserRecord = typeof users.$inferInsert
export type Plan = typeof plans.$inferSelect
export type NewPlan = typeof plans.$inferInsert
export type Participant = typeof participants.$inferSelect
export type NewParticipant = typeof participants.$inferInsert
export type Assignment = { participantId: string; status: ItemStatus }
export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
export type PlanInvite = typeof planInvites.$inferSelect
export type NewPlanInvite = typeof planInvites.$inferInsert
export type ParticipantJoinRequest = typeof participantJoinRequests.$inferSelect
export type NewParticipantJoinRequest =
  typeof participantJoinRequests.$inferInsert
export type ItemChange = typeof itemChanges.$inferSelect
export type NewItemChange = typeof itemChanges.$inferInsert
export type ParticipantExpense = typeof participantExpenses.$inferSelect
export type NewParticipantExpense = typeof participantExpenses.$inferInsert
export type WhatsappNotification = typeof whatsappNotifications.$inferSelect
export type NewWhatsappNotification = typeof whatsappNotifications.$inferInsert
export type AiUsageLog = typeof aiUsageLogs.$inferSelect
export type NewAiUsageLog = typeof aiUsageLogs.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
