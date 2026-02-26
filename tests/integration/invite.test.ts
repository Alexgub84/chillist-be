import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
  seedTestItems,
  getTestDb,
} from '../helpers/db.js'
import { items } from '../../src/db/schema.js'

describe('Invite Route', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    app = await buildApp({ db }, { logger: false })
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  describe('GET /plans/:planId/invite/:inviteToken', () => {
    it('returns plan data with filtered participants when token is valid', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 3)
      await seedTestItems(plan.planId, 2)

      const token = participants[1].inviteToken!

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result.planId).toBe(plan.planId)
      expect(result.title).toBe('Test Plan 1')
      expect(result.items).toHaveLength(2)
      expect(result.participants).toHaveLength(3)
    })

    it('returns only displayName and role for participants (no PII)', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 2)

      const token = participants[0].inviteToken!

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      const participant = result.participants[0]

      expect(participant.participantId).toBeDefined()
      expect(participant.displayName).toBeDefined()
      expect(participant.role).toBeDefined()

      expect(participant.name).toBeUndefined()
      expect(participant.lastName).toBeUndefined()
      expect(participant.contactPhone).toBeUndefined()
      expect(participant.contactEmail).toBeUndefined()
      expect(participant.avatarUrl).toBeUndefined()
      expect(participant.inviteToken).toBeUndefined()
    })

    it('does not expose ownerParticipantId in response', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participants[0].inviteToken}`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result.ownerParticipantId).toBeUndefined()
      expect(result.visibility).toBeUndefined()
    })

    it('returns 404 when invite token is invalid', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/invalid-token-that-does-not-exist`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Invalid or expired invite link',
      })
    })

    it('returns 404 when token belongs to a different plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const participants1 = await seedTestParticipants(plan1.planId, 1)
      await seedTestParticipants(plan2.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan2.planId}/invite/${participants1[0].inviteToken}`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Invalid or expired invite link',
      })
    })

    it('does not require API key header', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participants[0].inviteToken}`,
        headers: {},
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 400 for invalid planId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/not-a-uuid/invite/some-token',
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /plans/:planId/invite/:inviteToken — item filtering', () => {
    it('shows unassigned items to invite user', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      await seedTestItems(plan.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participantList[1].inviteToken}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().items).toHaveLength(3)
    })

    it('shows items assigned to the invite user', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)

      const db = await getTestDb()
      await db.insert(items).values({
        planId: plan.planId,
        name: 'My Item',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
        assignedParticipantId: participantList[1].participantId,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participantList[1].inviteToken}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().items).toHaveLength(1)
      expect(response.json().items[0].name).toBe('My Item')
    })

    it('hides items assigned to other participants', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 3)

      const db = await getTestDb()
      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Unassigned Tent',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
        },
        {
          planId: plan.planId,
          name: 'My Sleeping Bag',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[1].participantId,
        },
        {
          planId: plan.planId,
          name: 'Other Person Stove',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[2].participantId,
        },
      ])

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participantList[1].inviteToken}`,
      })

      expect(response.statusCode).toBe(200)
      const resultItems = response.json().items
      expect(resultItems).toHaveLength(2)
      const names = resultItems.map((i: { name: string }) => i.name)
      expect(names).toContain('Unassigned Tent')
      expect(names).toContain('My Sleeping Bag')
      expect(names).not.toContain('Other Person Stove')
    })
  })

  describe('PATCH /plans/:planId/invite/:inviteToken/preferences', () => {
    it('updates guest preferences and returns preference fields', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 2)
      const token = participants[1].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: {
          displayName: 'Alex G',
          adultsCount: 2,
          kidsCount: 1,
          foodPreferences: 'vegetarian',
          allergies: 'peanuts',
          notes: 'Arriving late',
        },
      })

      expect(response.statusCode).toBe(200)

      const body = response.json()
      expect(body.participantId).toBe(participants[1].participantId)
      expect(body.displayName).toBe('Alex G')
      expect(body.adultsCount).toBe(2)
      expect(body.kidsCount).toBe(1)
      expect(body.foodPreferences).toBe('vegetarian')
      expect(body.allergies).toBe('peanuts')
      expect(body.notes).toBe('Arriving late')
      expect(body.role).toBe('participant')
      expect(body.rsvpStatus).toBe('pending')
    })

    it('allows partial updates — only sent fields are changed', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const token = participants[0].inviteToken!

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { foodPreferences: 'vegan', allergies: 'gluten' },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { allergies: 'dairy' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.foodPreferences).toBe('vegan')
      expect(body.allergies).toBe('dairy')
    })

    it('clears a field when null is sent', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const token = participants[0].inviteToken!

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { foodPreferences: 'kosher' },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { foodPreferences: null },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().foodPreferences).toBeNull()
    })

    it('returns 400 when body is empty', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const token = participants[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ message: 'No fields to update' })
    })

    it('returns 404 when invite token is invalid', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/bad-token-value/preferences`,
        payload: { displayName: 'Test' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Invalid invite token or plan not found',
      })
    })

    it('returns 404 when token belongs to a different plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const participants1 = await seedTestParticipants(plan1.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan2.planId}/invite/${participants1[0].inviteToken}/preferences`,
        payload: { displayName: 'Cross-plan' },
      })

      expect(response.statusCode).toBe(404)
    })

    it('does not require API key header', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const token = participants[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        headers: {},
        payload: { displayName: 'No API Key' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('does not expose PII fields in response', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const token = participants[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { displayName: 'Updated' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.name).toBeUndefined()
      expect(body.lastName).toBeUndefined()
      expect(body.contactPhone).toBeUndefined()
      expect(body.contactEmail).toBeUndefined()
      expect(body.inviteToken).toBeUndefined()
    })
  })

  describe('GET /plans/:planId/invite/:inviteToken — guest identity fields', () => {
    it('returns myParticipantId matching the token owner', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      const token = participantList[1].inviteToken!

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.myParticipantId).toBe(participantList[1].participantId)
    })

    it('returns myRsvpStatus defaulting to pending', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().myRsvpStatus).toBe('pending')
    })

    it('returns myPreferences with default null values', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)
      const prefs = response.json().myPreferences
      expect(prefs).toBeDefined()
      expect(prefs.adultsCount).toBeNull()
      expect(prefs.kidsCount).toBeNull()
      expect(prefs.foodPreferences).toBeNull()
      expect(prefs.allergies).toBeNull()
      expect(prefs.notes).toBeNull()
    })

    it('returns updated myPreferences after PATCH', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: {
          adultsCount: 3,
          kidsCount: 2,
          foodPreferences: 'halal',
          allergies: 'nuts',
          notes: 'Late arrival',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)
      const prefs = response.json().myPreferences
      expect(prefs.adultsCount).toBe(3)
      expect(prefs.kidsCount).toBe(2)
      expect(prefs.foodPreferences).toBe('halal')
      expect(prefs.allergies).toBe('nuts')
      expect(prefs.notes).toBe('Late arrival')
    })

    it('reflects updated myRsvpStatus after PATCH preferences with rsvpStatus', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { rsvpStatus: 'confirmed' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().myRsvpStatus).toBe('confirmed')
    })
  })

  describe('PATCH /plans/:planId/invite/:inviteToken/preferences — rsvpStatus', () => {
    it('accepts rsvpStatus confirmed and persists it', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { rsvpStatus: 'confirmed' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('confirmed')
    })

    it('accepts rsvpStatus not_sure and persists it', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { rsvpStatus: 'not_sure' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('not_sure')
    })

    it('rejects rsvpStatus pending via schema validation', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/preferences`,
        payload: { rsvpStatus: 'pending' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /plans/:planId/invite/:inviteToken/items', () => {
    it('creates an item auto-assigned to the token participant', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      const token = participantList[1].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items`,
        payload: {
          name: 'Sleeping Bag',
          category: 'equipment',
          quantity: 1,
        },
      })

      expect(response.statusCode).toBe(201)
      const item = response.json()
      expect(item.name).toBe('Sleeping Bag')
      expect(item.category).toBe('equipment')
      expect(item.quantity).toBe(1)
      expect(item.unit).toBe('pcs')
      expect(item.status).toBe('pending')
      expect(item.assignedParticipantId).toBe(participantList[1].participantId)
      expect(item.planId).toBe(plan.planId)
    })

    it('defaults equipment unit to pcs', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 2,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().unit).toBe('pcs')
    })

    it('requires unit for food items', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items`,
        payload: {
          name: 'Water',
          category: 'food',
          quantity: 5,
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toBe('Unit is required for food items')
    })

    it('creates food item with explicit unit', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items`,
        payload: {
          name: 'Water',
          category: 'food',
          quantity: 5,
          unit: 'l',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().unit).toBe('l')
      expect(response.json().category).toBe('food')
    })

    it('creates item with subcategory', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items`,
        payload: {
          name: 'Stove',
          category: 'equipment',
          quantity: 1,
          subcategory: 'cooking',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().subcategory).toBe('cooking')
    })

    it('returns 404 for invalid invite token', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/bad-token-value/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toBe(
        'Invalid invite token or plan not found'
      )
    })

    it('returns 404 when token belongs to a different plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const participants1 = await seedTestParticipants(plan1.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan2.planId}/invite/${participants1[0].inviteToken}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('does not require API key header', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items`,
        headers: {},
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
        },
      })

      expect(response.statusCode).toBe(201)
    })
  })

  describe('PATCH /plans/:planId/invite/:inviteToken/items/:itemId', () => {
    it('updates an item assigned to the token participant', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      const token = participantList[1].inviteToken!

      const db = await getTestDb()
      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Old Name',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[1].participantId,
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${item.itemId}`,
        payload: { name: 'New Name', quantity: 3, subcategory: 'sleeping' },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.name).toBe('New Name')
      expect(updated.quantity).toBe(3)
      expect(updated.subcategory).toBe('sleeping')
      expect(updated.assignedParticipantId).toBe(
        participantList[1].participantId
      )
    })

    it('returns 403 when item is assigned to a different participant', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 3)
      const token = participantList[1].inviteToken!

      const db = await getTestDb()
      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Other Item',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[2].participantId,
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${item.itemId}`,
        payload: { name: 'Hacked Name' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().message).toBe(
        'You can only edit items assigned to you'
      )
    })

    it('allows editing an unassigned item', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const db = await getTestDb()
      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Unassigned Item',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${item.itemId}`,
        payload: { name: 'Claimed Item', status: 'purchased' },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.name).toBe('Claimed Item')
      expect(updated.status).toBe('purchased')
    })

    it('returns 404 for non-existent item', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!
      const fakeItemId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${fakeItemId}`,
        payload: { name: 'Ghost Item' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toBe('Item not found')
    })

    it('returns 400 when body is empty', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const db = await getTestDb()
      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Test',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[0].participantId,
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${item.itemId}`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toBe('No fields to update')
    })

    it('returns 404 for invalid invite token', async () => {
      const [plan] = await seedTestPlans(1)
      const fakeItemId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/bad-token-value/items/${fakeItemId}`,
        payload: { name: 'Test' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toBe(
        'Invalid invite token or plan not found'
      )
    })

    it('allows updating item status', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const db = await getTestDb()
      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[0].participantId,
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${item.itemId}`,
        payload: { status: 'purchased' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('purchased')
    })

    it('does not require API key header', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const db = await getTestDb()
      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          unit: 'pcs',
          status: 'pending',
          assignedParticipantId: participantList[0].participantId,
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/${item.itemId}`,
        headers: {},
        payload: { name: 'Updated' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('POST /plans/:planId/invite/:inviteToken/items/bulk', () => {
    it('creates multiple items auto-assigned to the guest', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      const token = participantList[1].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: {
          items: [
            { name: 'Tent', category: 'equipment', quantity: 1 },
            { name: 'Water', category: 'food', quantity: 5, unit: 'l' },
          ],
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items).toHaveLength(2)
      expect(body.errors).toHaveLength(0)
      body.items.forEach((item: { assignedParticipantId: string }) => {
        expect(item.assignedParticipantId).toBe(
          participantList[1].participantId
        )
      })
    })

    it('returns 207 with partial success when food item misses unit', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: {
          items: [
            { name: 'Sleeping Bag', category: 'equipment', quantity: 1 },
            { name: 'Rice', category: 'food', quantity: 2 },
          ],
        },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].name).toBe('Sleeping Bag')
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toEqual({
        name: 'Rice',
        message: 'Unit is required for food items',
      })
    })

    it('returns 404 for invalid invite token', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/bad-token/items/bulk`,
        payload: {
          items: [{ name: 'Tent', category: 'equipment', quantity: 1 }],
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 400 when items array is empty', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: { items: [] },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PATCH /plans/:planId/invite/:inviteToken/items/bulk', () => {
    it('updates multiple owned items and returns 200', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      const token = participantList[1].inviteToken!

      const db = await getTestDb()
      const insertedItems = await db
        .insert(items)
        .values([
          {
            planId: plan.planId,
            name: 'Item A',
            category: 'equipment' as const,
            quantity: 1,
            unit: 'pcs' as const,
            status: 'pending' as const,
            assignedParticipantId: participantList[1].participantId,
          },
          {
            planId: plan.planId,
            name: 'Item B',
            category: 'equipment' as const,
            quantity: 2,
            unit: 'pcs' as const,
            status: 'pending' as const,
            assignedParticipantId: participantList[1].participantId,
          },
        ])
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: {
          items: [
            { itemId: insertedItems[0].itemId, status: 'purchased' },
            { itemId: insertedItems[1].itemId, name: 'Updated B' },
          ],
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items).toHaveLength(2)
      expect(body.errors).toHaveLength(0)
      expect(body.items[0].status).toBe('purchased')
      expect(body.items[1].name).toBe('Updated B')
    })

    it('returns 207 when some items belong to another participant', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 3)
      const token = participantList[1].inviteToken!

      const db = await getTestDb()
      const insertedItems = await db
        .insert(items)
        .values([
          {
            planId: plan.planId,
            name: 'My Item',
            category: 'equipment' as const,
            quantity: 1,
            unit: 'pcs' as const,
            status: 'pending' as const,
            assignedParticipantId: participantList[1].participantId,
          },
          {
            planId: plan.planId,
            name: 'Other Item',
            category: 'equipment' as const,
            quantity: 1,
            unit: 'pcs' as const,
            status: 'pending' as const,
            assignedParticipantId: participantList[2].participantId,
          },
        ])
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: {
          items: [
            { itemId: insertedItems[0].itemId, status: 'purchased' },
            { itemId: insertedItems[1].itemId, status: 'purchased' },
          ],
        },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].name).toBe('My Item')
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toEqual({
        name: 'Other Item',
        message: 'You can only edit items assigned to you',
      })
    })

    it('returns 404 for non-existent item in bulk', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: {
          items: [{ itemId: fakeId, name: 'Ghost', status: 'packed' }],
        },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(0)
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toEqual({
        name: 'Ghost',
        message: 'Item not found',
      })
    })

    it('returns 404 for invalid invite token', async () => {
      const [plan] = await seedTestPlans(1)
      const fakeItemId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/bad-token/items/bulk`,
        payload: {
          items: [{ itemId: fakeItemId, status: 'packed' }],
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 400 when items array is empty', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/invite/${token}/items/bulk`,
        payload: { items: [] },
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
