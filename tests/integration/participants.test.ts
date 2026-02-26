import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  getTestDb,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { participants } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'

describe('Participants Route', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    token = await signTestJwt({ sub: TEST_USER_ID })
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
      }
    )
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result).toHaveLength(3)

      const first = result[0]
      expect(first.participantId).toBe(seeded[0].participantId)
      expect(first.planId).toBe(plan.planId)
      expect(first.name).toBe('First1')
      expect(first.lastName).toBe('Last1')
      expect(first.contactPhone).toBe('+1-555-000-0001')
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Plan not found' })
    })

    it('returns 400 for invalid planId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/invalid-uuid/participants',
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alex',
          lastName: 'Guberman',
          contactPhone: '+1-555-123-4567',
        },
      })

      expect(response.statusCode).toBe(201)

      const participant = response.json()
      expect(participant.participantId).toBeDefined()
      expect(participant.planId).toBe(plan.planId)
      expect(participant.name).toBe('Alex')
      expect(participant.lastName).toBe('Guberman')
      expect(participant.contactPhone).toBe('+1-555-123-4567')
      expect(participant.displayName).toBeNull()
      expect(participant.role).toBe('participant')
      expect(participant.avatarUrl).toBeNull()
      expect(participant.contactEmail).toBeNull()
      expect(participant.createdAt).toBeDefined()
      expect(participant.updatedAt).toBeDefined()
    })

    it('creates participant with all optional fields', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alexander',
          lastName: 'Smith',
          contactPhone: '+1234567890',
          displayName: 'Sasha',
          role: 'viewer',
          avatarUrl: 'https://example.com/avatar.jpg',
          contactEmail: 'sasha@example.com',
        },
      })

      expect(response.statusCode).toBe(201)

      const participant = response.json()
      expect(participant.name).toBe('Alexander')
      expect(participant.lastName).toBe('Smith')
      expect(participant.contactPhone).toBe('+1234567890')
      expect(participant.displayName).toBe('Sasha')
      expect(participant.role).toBe('viewer')
      expect(participant.avatarUrl).toBe('https://example.com/avatar.jpg')
      expect(participant.contactEmail).toBe('sasha@example.com')
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${nonExistentId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alex',
          lastName: 'Guberman',
          contactPhone: '+1-555-123-4567',
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Plan not found' })
    })

    it.each([
      ['name', { lastName: 'Smith', contactPhone: '+1234567890' }],
      ['lastName', { name: 'Alex', contactPhone: '+1234567890' }],
      ['contactPhone', { name: 'Alex', lastName: 'Smith' }],
    ])('returns 400 when %s is missing', async (_field, payload) => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when name is empty string', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '', lastName: 'Smith', contactPhone: '+1234567890' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when using old displayName-only format', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: { displayName: 'Alex' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for invalid role value', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alex',
          lastName: 'Smith',
          contactPhone: '+1234567890',
          role: 'admin',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when role is owner', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alex',
          lastName: 'Smith',
          contactPhone: '+1234567890',
          role: 'owner',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('created participant is retrievable via GET', async () => {
      const [plan] = await seedTestPlans(1)

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alex',
          lastName: 'Guberman',
          contactPhone: '+1-555-123-4567',
        },
      })

      const created = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const result = response.json()
      expect(result.participantId).toBe(participant.participantId)
      expect(result.planId).toBe(plan.planId)
      expect(result.name).toBe('First1')
      expect(result.lastName).toBe('Last1')
      expect(result.contactPhone).toBe('+1-555-000-0001')
    })

    it('returns 404 when participant does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/participants/${nonExistentId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 for invalid participantId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/participants/invalid-uuid',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PATCH /participants/:participantId', () => {
    it('updates name and returns 200', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated' },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.participantId).toBe(participant.participantId)
      expect(updated.name).toBe('Updated')
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(participant.updatedAt).getTime()
      )
    })

    it('updates multiple fields at once', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const seeded = await seedTestParticipants(plan.planId, 2)
      const participant = seeded.find((p) => p.role !== 'owner')!

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'NewFirst',
          lastName: 'NewLast',
          contactPhone: '+1-999-999-9999',
          displayName: 'New Display',
          role: 'viewer',
          contactEmail: 'new@example.com',
        },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.name).toBe('NewFirst')
      expect(updated.lastName).toBe('NewLast')
      expect(updated.contactPhone).toBe('+1-999-999-9999')
      expect(updated.displayName).toBe('New Display')
      expect(updated.role).toBe('viewer')
      expect(updated.contactEmail).toBe('new@example.com')
    })

    it('sets nullable fields to null', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Alexander',
          lastName: 'Smith',
          contactPhone: '+1234567890',
          displayName: 'Alex',
          contactEmail: 'alex@example.com',
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${created.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { displayName: null, contactEmail: null },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().displayName).toBeNull()
      expect(response.json().contactEmail).toBeNull()
    })

    it('returns 404 when participant does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${nonExistentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Ghost' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 for invalid participantId format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/participants/invalid-uuid',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for invalid role value', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'admin' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when changing owner role', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const seeded = await seedTestParticipants(plan.planId, 1)
      const owner = seeded[0]

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${owner.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'viewer' },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        message: 'Cannot change role of owner participant',
      })
    })

    it('allows updating owner non-role fields', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const seeded = await seedTestParticipants(plan.planId, 1)
      const owner = seeded[0]

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${owner.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'UpdatedOwnerName' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('UpdatedOwnerName')
      expect(response.json().role).toBe('owner')
    })

    it('returns 400 when name is empty string', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '' },
      })

      expect(response.statusCode).toBe(400)
    })

    it.each(['pending', 'confirmed', 'not_sure'] as const)(
      'updates rsvpStatus to %s',
      async (rsvpStatus) => {
        const [plan] = await seedTestPlans(1, {
          createdByUserId: TEST_USER_ID,
        })
        const [participant] = await seedTestParticipants(plan.planId, 1)

        const response = await app.inject({
          method: 'PATCH',
          url: `/participants/${participant.participantId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { rsvpStatus },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json().rsvpStatus).toBe(rsvpStatus)
      }
    )

    it('returns 400 for invalid rsvpStatus value', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rsvpStatus: 'declined' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('allows linked participant to update their own record', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const db = await getTestDb()
      const [selfParticipant] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Other',
          lastName: 'User',
          contactPhone: '+1-555-999-0000',
          role: 'participant',
          userId: OTHER_USER_ID,
          inviteToken: randomBytes(32).toString('hex'),
        })
        .returning()

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${selfParticipant.participantId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { rsvpStatus: 'confirmed' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('confirmed')
      expect(response.json().inviteToken).toBeNull()
    })

    it('returns 403 when participant edits another participant', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const seeded = await seedTestParticipants(plan.planId, 2)
      const targetParticipant = seeded.find((p) => p.role !== 'owner')!

      const db = await getTestDb()
      await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Unrelated',
          lastName: 'Person',
          contactPhone: '+1-555-888-0000',
          role: 'participant',
          userId: OTHER_USER_ID,
          inviteToken: randomBytes(32).toString('hex'),
        })
        .returning()

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${targetParticipant.participantId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { rsvpStatus: 'confirmed' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        message: 'You can only edit your own preferences',
      })
    })

    it('allows admin to update any participant', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const adminToken = await signTestJwt({
        sub: ADMIN_USER_ID,
        app_metadata: { role: 'admin' },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rsvpStatus: 'confirmed' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('confirmed')
    })

    it('owner can update any participant rsvpStatus', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const seeded = await seedTestParticipants(plan.planId, 2)
      const nonOwner = seeded.find((p) => p.role !== 'owner')!

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${nonOwner.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rsvpStatus: 'not_sure' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('not_sure')
    })

    it('returns 403 for unlinked participant (no userId match)', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participant.participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rsvpStatus: 'confirmed' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({
        message: 'You can only edit your own preferences',
      })
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
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/participants/${nonOwner.participantId}`,
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 for invalid participantId format', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/participants/invalid-uuid',
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      const getItemsResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })
      const items = getItemsResponse.json()
      const updatedItem = items.find(
        (i: { itemId: string }) => i.itemId === item.itemId
      )
      expect(updatedItem.assignedParticipantId).toBeNull()
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })
      const newToken = regenResponse.json().inviteToken

      const oldTokenResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${oldToken}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(oldTokenResponse.statusCode).toBe(404)

      const newTokenResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${newToken}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(newTokenResponse.statusCode).toBe(200)
    })

    it('returns 404 when participant does not exist', async () => {
      const [plan] = await seedTestPlans(1)
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants/${nonExistentId}/regenerate-token`,
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
