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
} from '../helpers/db.js'

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
