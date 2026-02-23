import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
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

export const userDetails = pgTable('user_details', {
  userId: uuid('user_id').primaryKey(),
  foodPreferences: text('food_preferences'),
  allergies: text('allergies'),
  defaultEquipment: jsonb('default_equipment'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

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
export const itemCategoryEnum = pgEnum('item_category', ['equipment', 'food'])
export const itemStatusEnum = pgEnum('item_status', [
  'pending',
  'purchased',
  'packed',
  'canceled',
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
  notes: text('notes'),
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
  status: itemStatusEnum('status').default('pending').notNull(),
  notes: text('notes'),
  assignedParticipantId: uuid('assigned_participant_id').references(
    () => participants.participantId,
    { onDelete: 'set null' }
  ),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
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
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const guestProfilesRelations = relations(guestProfiles, ({ many }) => ({
  participants: many(participants),
}))

export const plansRelations = relations(plans, ({ many }) => ({
  items: many(items),
  participants: many(participants),
  invites: many(planInvites),
}))

export const itemsRelations = relations(items, ({ one }) => ({
  plan: one(plans, {
    fields: [items.planId],
    references: [plans.planId],
  }),
  assignedParticipant: one(participants, {
    fields: [items.assignedParticipantId],
    references: [participants.participantId],
  }),
}))

export const participantsRelations = relations(participants, ({ one }) => ({
  plan: one(plans, {
    fields: [participants.planId],
    references: [plans.planId],
  }),
  guestProfile: one(guestProfiles, {
    fields: [participants.guestProfileId],
    references: [guestProfiles.guestId],
  }),
  invite: one(planInvites),
}))

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

export type GuestProfile = typeof guestProfiles.$inferSelect
export type NewGuestProfile = typeof guestProfiles.$inferInsert
export type UserDetail = typeof userDetails.$inferSelect
export type NewUserDetail = typeof userDetails.$inferInsert
export type Plan = typeof plans.$inferSelect
export type NewPlan = typeof plans.$inferInsert
export type Participant = typeof participants.$inferSelect
export type NewParticipant = typeof participants.$inferInsert
export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
export type PlanInvite = typeof planInvites.$inferSelect
export type NewPlanInvite = typeof planInvites.$inferInsert
