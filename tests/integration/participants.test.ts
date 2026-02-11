import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'

describe('Participants Route', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    app = await buildApp({ db })
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  describe('GET /plans/:planId/participants', () => {
    it('returns 200 with empty array when plan has no participants', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns 200 with all participants for a plan', async () => {
      const [plan] = await seedTestPlans(1)
      const seeded = await seedTestParticipants(plan.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result).toHaveLength(3)

      const first = result[0]
      expect(first.participantId).toBe(seeded[0].participantId)
      expect(first.planId).toBe(plan.planId)
      expect(first.displayName).toBe('Participant 1')
      expect(first.role).toBe('owner')
      expect(first.createdAt).toBeDefined()
      expect(first.updatedAt).toBeDefined()
    })

    it('returns only participants belonging to the requested plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestParticipants(plan1.planId, 2)
      await seedTestParticipants(plan2.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan1.planId}/participants`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result).toHaveLength(2)
      result.forEach((p: { planId: string }) => {
        expect(p.planId).toBe(plan1.planId)
      })
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${nonExistentId}/participants`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Plan not found' })
    })

    it('returns 400 for invalid planId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/invalid-uuid/participants',
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /plans/:planId/participants', () => {
    it('creates participant with required fields and returns 201', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {
          displayName: 'Alex',
        },
      })

      expect(response.statusCode).toBe(201)

      const participant = response.json()
      expect(participant.participantId).toBeDefined()
      expect(participant.planId).toBe(plan.planId)
      expect(participant.displayName).toBe('Alex')
      expect(participant.role).toBe('participant')
      expect(participant.name).toBeNull()
      expect(participant.lastName).toBeNull()
      expect(participant.avatarUrl).toBeNull()
      expect(participant.contactEmail).toBeNull()
      expect(participant.contactPhone).toBeNull()
      expect(participant.createdAt).toBeDefined()
      expect(participant.updatedAt).toBeDefined()
    })

    it('creates participant with all optional fields', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {
          displayName: 'Sasha',
          role: 'owner',
          name: 'Alexander',
          lastName: 'Smith',
          avatarUrl: 'https://example.com/avatar.jpg',
          contactEmail: 'sasha@example.com',
          contactPhone: '+1234567890',
        },
      })

      expect(response.statusCode).toBe(201)

      const participant = response.json()
      expect(participant.displayName).toBe('Sasha')
      expect(participant.role).toBe('owner')
      expect(participant.name).toBe('Alexander')
      expect(participant.lastName).toBe('Smith')
      expect(participant.avatarUrl).toBe('https://example.com/avatar.jpg')
      expect(participant.contactEmail).toBe('sasha@example.com')
      expect(participant.contactPhone).toBe('+1234567890')
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${nonExistentId}/participants`,
        payload: { displayName: 'Alex' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Plan not found' })
    })

    it('returns 400 when displayName is missing', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when displayName is empty string', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: { displayName: '' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for invalid role value', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: { displayName: 'Alex', role: 'admin' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('created participant is retrievable via GET', async () => {
      const [plan] = await seedTestPlans(1)

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: { displayName: 'Alex' },
      })

      const created = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
      })

      expect(getResponse.statusCode).toBe(200)
      const list = getResponse.json()
      expect(list).toHaveLength(1)
      expect(list[0].participantId).toBe(created.participantId)
    })
  })

  describe('GET /participants/:participantId', () => {
    it('returns 200 with participant data', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/participants/${participant.participantId}`,
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result.participantId).toBe(participant.participantId)
      expect(result.planId).toBe(plan.planId)
      expect(result.displayName).toBe('Participant 1')
    })

    it('returns 404 when participant does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/participants/${nonExistentId}`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 for invalid participantId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/participants/invalid-uuid',
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PATCH /participants/:participantId', () => {
    it('updates displayName and returns 200', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        payload: { displayName: 'Updated Name' },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.participantId).toBe(participant.participantId)
      expect(updated.displayName).toBe('Updated Name')
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(participant.updatedAt).getTime()
      )
    })

    it('updates multiple fields at once', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        payload: {
          displayName: 'New Name',
          role: 'viewer',
          name: 'FirstName',
          lastName: 'LastName',
          contactEmail: 'new@example.com',
        },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.displayName).toBe('New Name')
      expect(updated.role).toBe('viewer')
      expect(updated.name).toBe('FirstName')
      expect(updated.lastName).toBe('LastName')
      expect(updated.contactEmail).toBe('new@example.com')
    })

    it('sets nullable fields to null', async () => {
      const [plan] = await seedTestPlans(1)

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        payload: {
          displayName: 'Alex',
          name: 'Alexander',
          contactEmail: 'alex@example.com',
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${created.participantId}`,
        payload: { name: null, contactEmail: null },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBeNull()
      expect(response.json().contactEmail).toBeNull()
    })

    it('returns 404 when participant does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${nonExistentId}`,
        payload: { displayName: 'Ghost' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 for invalid participantId format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/participants/invalid-uuid',
        payload: { displayName: 'Test' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for invalid role value', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        payload: { role: 'admin' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when displayName is empty string', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        payload: { displayName: '' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('DELETE /participants/:participantId', () => {
    it('deletes participant and returns 200', async () => {
      const [plan] = await seedTestPlans(1)
      const seeded = await seedTestParticipants(plan.planId, 2)
      const nonOwner = seeded.find((p) => p.role !== 'owner')!

      const response = await app.inject({
        method: 'DELETE',
        url: `/participants/${nonOwner.participantId}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/participants/${nonOwner.participantId}`,
      })
      expect(getResponse.statusCode).toBe(404)
    })

    it('returns 400 when deleting participant with owner role', async () => {
      const [plan] = await seedTestPlans(1)
      const seeded = await seedTestParticipants(plan.planId, 1)
      const owner = seeded[0]

      const response = await app.inject({
        method: 'DELETE',
        url: `/participants/${owner.participantId}`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        message: 'Cannot delete participant with owner role',
      })
    })

    it('returns 404 when participant does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/participants/${nonExistentId}`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 for invalid participantId format', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/participants/invalid-uuid',
      })

      expect(response.statusCode).toBe(400)
    })

    it('nullifies assignedParticipantId on items when participant is deleted', async () => {
      const [plan] = await seedTestPlans(1)
      const seeded = await seedTestParticipants(plan.planId, 2)
      const nonOwner = seeded.find((p) => p.role !== 'owner')!

      const createItemResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignedParticipantId: nonOwner.participantId,
        },
      })
      const item = createItemResponse.json()
      expect(item.assignedParticipantId).toBe(nonOwner.participantId)

      await app.inject({
        method: 'DELETE',
        url: `/participants/${nonOwner.participantId}`,
      })

      const getItemsResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
      })
      const items = getItemsResponse.json()
      const updatedItem = items.find(
        (i: { itemId: string }) => i.itemId === item.itemId
      )
      expect(updatedItem.assignedParticipantId).toBeNull()
    })
  })
})
