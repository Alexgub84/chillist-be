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

  describe('Create item with isAllParticipants and full assignmentStatusList', () => {
    it('creates item with assignmentStatusList containing all participants', async () => {
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
          isAllParticipants: true,
          assignmentStatusList: planParticipants.map((p) => ({
            participantId: p.participantId,
            status: 'pending',
          })),
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
    })
  })

  describe('Create item with explicit subset assignmentStatusList', () => {
    it('creates item with only the specified participants', async () => {
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
            status: 'pending',
          })),
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.isAllParticipants).toBe(false)
      expect(created.assignmentStatusList).toHaveLength(2)
    })
  })

  describe('Update item with new assignmentStatusList (owner)', () => {
    it('replaces assignmentStatusList with all participants', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          isAllParticipants: true,
          assignmentStatusList: planParticipants.map((p) => ({
            participantId: p.participantId,
            status: 'pending',
          })),
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.isAllParticipants).toBe(true)
      expect(updated.assignmentStatusList).toHaveLength(3)
    })
  })

  describe('Non-owner self-update via assignmentStatusList', () => {
    it('non-owner can update their own status', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: OTHER_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 2, {
        ownerUserId: OTHER_USER_ID,
      })
      const myParticipant = await seedTestParticipantWithUser(
        plan.planId,
        TEST_USER_ID
      )

      const createToken = await signTestJwt({ sub: OTHER_USER_ID })
      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Status Item',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          isAllParticipants: true,
          assignmentStatusList: [
            ...planParticipants.map((p) => ({
              participantId: p.participantId,
              status: 'pending',
            })),
            { participantId: myParticipant.participantId, status: 'pending' },
          ],
        },
        headers: { authorization: `Bearer ${createToken}` },
      })
      const item = createResponse.json()

      const updatedList = item.assignmentStatusList.map(
        (a: { participantId: string; status: string }) =>
          a.participantId === myParticipant.participantId
            ? { ...a, status: 'purchased' }
            : a
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { assignmentStatusList: updatedList },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      const myEntry = updated.assignmentStatusList.find(
        (a: { participantId: string }) =>
          a.participantId === myParticipant.participantId
      )
      expect(myEntry).toBeDefined()
      expect(myEntry.status).toBe('purchased')
    })

    it('non-owner can unassign themselves', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: OTHER_USER_ID })
      await seedTestParticipants(plan.planId, 2, {
        ownerUserId: OTHER_USER_ID,
      })
      const myParticipant = await seedTestParticipantWithUser(
        plan.planId,
        TEST_USER_ID
      )
      const [item] = await seedTestItems(plan.planId, 1)

      const ownerToken = await signTestJwt({ sub: OTHER_USER_ID })
      await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          assignmentStatusList: [
            { participantId: myParticipant.participantId, status: 'pending' },
          ],
        },
        headers: { authorization: `Bearer ${ownerToken}` },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { assignmentStatusList: [] },
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

  describe('Non-owner cannot modify other assignments', () => {
    it('non-owner receives 400 when setting isAllParticipants', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: OTHER_USER_ID })
      await seedTestParticipants(plan.planId, 2, { ownerUserId: OTHER_USER_ID })
      await seedTestParticipantWithUser(plan.planId, TEST_USER_ID)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { isAllParticipants: true },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('all-participants flag')
    })

    it('non-owner receives 400 when adding another participant', async () => {
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

    it('non-owner receives 400 on create with assignments', async () => {
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
          isAllParticipants: true,
          assignmentStatusList: [],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('owner')
    })
  })

  describe('New participant added', () => {
    it('auto-added to isAllParticipants items', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 2, {
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
          isAllParticipants: true,
          assignmentStatusList: planParticipants.map((p) => ({
            participantId: p.participantId,
            status: 'pending',
          })),
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
      const planItems = getResponse.json()
      const allItem = planItems.find(
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
          isAllParticipants: true,
          assignmentStatusList: planParticipants.map((p) => ({
            participantId: p.participantId,
            status: 'pending',
          })),
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
      const planItems = getResponse.json()
      const updatedItem = planItems.find(
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
