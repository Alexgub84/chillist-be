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

export const planStatusEnum = pgEnum('plan_status', [
  'draft',
  'active',
  'archived',
])
export const visibilityEnum = pgEnum('visibility', [
  'public',
  'unlisted',
  'private',
])
export const participantRoleEnum = pgEnum('participant_role', [
  'owner',
  'participant',
  'viewer',
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
  name: varchar('name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  role: participantRoleEnum('role').default('participant').notNull(),
  avatarUrl: text('avatar_url'),
  contactEmail: varchar('contact_email', { length: 255 }),
  inviteToken: varchar('invite_token', { length: 64 }).unique(),
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

export const plansRelations = relations(plans, ({ many }) => ({
  items: many(items),
  participants: many(participants),
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
}))

export type Plan = typeof plans.$inferSelect
export type NewPlan = typeof plans.$inferInsert
export type Participant = typeof participants.$inferSelect
export type NewParticipant = typeof participants.$inferInsert
export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
