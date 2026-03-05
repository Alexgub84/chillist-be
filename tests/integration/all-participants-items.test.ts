import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  getTestDb,
  seedTestItems,
  seedTestParticipants,
  seedTestParticipantWithUser,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'
import { addParticipantToPlan } from '../../src/services/participant.service.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'

describe('All Participants Items — JSONB assignment model', () => {
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

  describe('Create item with assignToAll: true', () => {
    it('creates item with assignmentStatusList containing all participants and isAllParticipants: true', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Shared Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignToAll: true,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.isAllParticipants).toBe(true)
      expect(created.assignmentStatusList).toHaveLength(3)
      const assignedIds = created.assignmentStatusList.map(
        (a: { participantId: string }) => a.participantId
      )
      const expectedIds = planParticipants.map((p) => p.participantId)
      expect(assignedIds.sort()).toEqual(expectedIds.sort())
      created.assignmentStatusList.forEach(
        (a: { participantId: string; status: string }) => {
          expect(a.status).toBe('pending')
        }
      )
    })
  })

  describe('Create item with explicit assignmentStatusList', () => {
    it('creates item with only the specified participants in assignmentStatusList', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })
      const subset = planParticipants.slice(0, 2)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Subset Item',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignmentStatusList: subset.map((p) => ({
            participantId: p.participantId,
            status: 'pending' as const,
          })),
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.isAllParticipants).toBe(false)
      expect(created.assignmentStatusList).toHaveLength(2)
      const assignedIds = created.assignmentStatusList.map(
        (a: { participantId: string }) => a.participantId
      )
      expect(assignedIds.sort()).toEqual(
        subset.map((p) => p.participantId).sort()
      )
    })
  })

  describe('Update item with assignToAll: true', () => {
    it('replaces assignmentStatusList with all participants', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { assignToAll: true },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.isAllParticipants).toBe(true)
      expect(updated.assignmentStatusList).toHaveLength(3)
      const assignedIds = updated.assignmentStatusList.map(
        (a: { participantId: string }) => a.participantId
      )
      expect(assignedIds.sort()).toEqual(
        planParticipants.map((p) => p.participantId).sort()
      )
    })
  })

  describe('Update with forParticipantId + status', () => {
    it('updates only that participant entry in assignmentStatusList', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })
      const target = planParticipants.find((p) => p.role === 'participant')!

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Status Item',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignToAll: true,
        },
        headers: { authorization: `Bearer ${token}` },
      })
      const item = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          forParticipantId: target.participantId,
          status: 'purchased',
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      const targetEntry = updated.assignmentStatusList.find(
        (a: { participantId: string }) =>
          a.participantId === target.participantId
      )
      expect(targetEntry).toBeDefined()
      expect(targetEntry.status).toBe('purchased')
    })
  })

  describe('Non-owner self-unassign via forParticipantId + unassign: true', () => {
    it('non-owner can remove themselves from assignmentStatusList', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: OTHER_USER_ID })
      await seedTestParticipants(plan.planId, 2, { ownerUserId: OTHER_USER_ID })
      const myParticipant = await seedTestParticipantWithUser(
        plan.planId,
        TEST_USER_ID
      )
      const [item] = await seedTestItems(plan.planId, 1)

      await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          assignmentStatusList: [
            { participantId: myParticipant.participantId, status: 'pending' },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          forParticipantId: myParticipant.participantId,
          unassign: true,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(
        updated.assignmentStatusList.some(
          (a: { participantId: string }) =>
            a.participantId === myParticipant.participantId
        )
      ).toBe(false)
    })
  })

  describe('Non-owner cannot set assignToAll or assignmentStatusList', () => {
    it('non-owner receives 400 when setting assignToAll', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: OTHER_USER_ID })
      await seedTestParticipants(plan.planId, 2, { ownerUserId: OTHER_USER_ID })
      await seedTestParticipantWithUser(plan.planId, TEST_USER_ID)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Attempt',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignToAll: true,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('owner')
    })

    it('non-owner receives 400 when setting assignmentStatusList with others', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: OTHER_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 2, {
        ownerUserId: OTHER_USER_ID,
      })
      const myParticipant = await seedTestParticipantWithUser(
        plan.planId,
        TEST_USER_ID
      )
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          assignmentStatusList: [
            { participantId: myParticipant.participantId, status: 'pending' },
            {
              participantId: planParticipants[0].participantId,
              status: 'pending',
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('New participant added', () => {
    it('auto-added to isAllParticipants items', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 2, {
        ownerUserId: TEST_USER_ID,
      })

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'All Item',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignToAll: true,
        },
        headers: { authorization: `Bearer ${token}` },
      })
      const item = createResponse.json()
      expect(item.assignmentStatusList).toHaveLength(2)

      const db = await getTestDb()
      await addParticipantToPlan(db, {
        planId: plan.planId,
        userId: 'cccccccc-1111-2222-3333-444444444444',
        name: 'New',
        lastName: 'Joiner',
        contactPhone: '+1-555-999-0000',
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })
      const items = getResponse.json()
      const allItem = items.find(
        (i: { itemId: string }) => i.itemId === item.itemId
      )
      expect(allItem).toBeDefined()
      expect(allItem.isAllParticipants).toBe(true)
      expect(allItem.assignmentStatusList).toHaveLength(3)
    })
  })

  describe('Participant deleted', () => {
    it('removed from assignmentStatusList on items', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })
      const target = planParticipants.find((p) => p.role === 'participant')!

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'All Item',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignToAll: true,
        },
        headers: { authorization: `Bearer ${token}` },
      })
      const item = createResponse.json()
      expect(
        item.assignmentStatusList.some(
          (a: { participantId: string }) =>
            a.participantId === target.participantId
        )
      ).toBe(true)

      await app.inject({
        method: 'DELETE',
        url: `/participants/${target.participantId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })
      const items = getResponse.json()
      const updatedItem = items.find(
        (i: { itemId: string }) => i.itemId === item.itemId
      )
      expect(updatedItem).toBeDefined()
      expect(
        updatedItem.assignmentStatusList.some(
          (a: { participantId: string }) =>
            a.participantId === target.participantId
        )
      ).toBe(false)
    })
  })
})
