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

  describe('POST /plans/:planId/participants/:participantId/regenerate-token', () => {
    it('generates a new token and returns it', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 2)
      const participant = participants[1]
      const oldToken = participant.inviteToken

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants/${participant.participantId}/regenerate-token`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result.inviteToken).toBeDefined()
      expect(typeof result.inviteToken).toBe('string')
      expect(result.inviteToken).toHaveLength(64)
      expect(result.inviteToken).not.toBe(oldToken)
    })

    it('invalidates the old token after regeneration', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)
      const oldToken = participants[0].inviteToken!

      const regenResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants/${participants[0].participantId}/regenerate-token`,
      })
      const newToken = regenResponse.json().inviteToken

      const oldTokenResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${oldToken}`,
      })
      expect(oldTokenResponse.statusCode).toBe(404)

      const newTokenResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${newToken}`,
      })
      expect(newTokenResponse.statusCode).toBe(200)
    })

    it('returns 404 when participant does not exist', async () => {
      const [plan] = await seedTestPlans(1)
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants/${nonExistentId}/regenerate-token`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Participant not found in this plan',
      })
    })

    it('returns 404 when participant belongs to a different plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const participants1 = await seedTestParticipants(plan1.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan2.planId}/participants/${participants1[0].participantId}/regenerate-token`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Participant not found in this plan',
      })
    })

    it('returns 400 for invalid UUID params', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/bad-uuid/participants/also-bad/regenerate-token',
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('Invite token generation on participant creation', () => {
    it('generates inviteToken when creating a participant via POST', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {
          name: 'Test',
          lastName: 'User',
          contactPhone: '+1-555-999-0000',
        },
      })

      expect(response.statusCode).toBe(201)

      const participant = response.json()
      expect(participant.inviteToken).toBeDefined()
      expect(typeof participant.inviteToken).toBe('string')
      expect(participant.inviteToken).toHaveLength(64)
    })

    it('generates unique inviteTokens for each participant', async () => {
      const [plan] = await seedTestPlans(1)

      const response1 = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {
          name: 'User',
          lastName: 'One',
          contactPhone: '+1-555-111-0001',
        },
      })

      const response2 = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {
          name: 'User',
          lastName: 'Two',
          contactPhone: '+1-555-111-0002',
        },
      })

      const token1 = response1.json().inviteToken
      const token2 = response2.json().inviteToken
      expect(token1).not.toBe(token2)
    })

    it('generates inviteTokens in POST /plans/with-owner', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Owner',
            lastName: 'Test',
            contactPhone: '+1-555-000-0001',
          },
          participants: [
            {
              name: 'Guest',
              lastName: 'One',
              contactPhone: '+1-555-000-0002',
            },
          ],
        },
      })

      expect(response.statusCode).toBe(201)

      const result = response.json()
      expect(result.participants).toHaveLength(2)

      const ownerParticipant = result.participants.find(
        (p: { role: string }) => p.role === 'owner'
      )
      const guestParticipant = result.participants.find(
        (p: { role: string }) => p.role === 'participant'
      )

      expect(ownerParticipant.inviteToken).toBeDefined()
      expect(ownerParticipant.inviteToken).toHaveLength(64)
      expect(guestParticipant.inviteToken).toBeDefined()
      expect(guestParticipant.inviteToken).toHaveLength(64)
      expect(ownerParticipant.inviteToken).not.toBe(
        guestParticipant.inviteToken
      )
    })
  })
})
