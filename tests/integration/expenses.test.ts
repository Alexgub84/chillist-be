import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestExpenses,
  seedTestParticipants,
  seedTestParticipantWithUser,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'

describe('Expenses Route', () => {
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

  describe('GET /plans/:planId/expenses', () => {
    it('returns empty expenses and summary for a plan with no expenses', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.expenses).toEqual([])
      expect(body.summary).toEqual([])
    })

    it('returns expenses and per-participant summary', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 2)
      const p1 = participants[0]
      const p2 = participants[1]

      await seedTestExpenses(plan.planId, p1.participantId, 2, {
        createdByUserId: TEST_USER_ID,
      })
      await seedTestExpenses(plan.planId, p2.participantId, 1, {
        createdByUserId: TEST_USER_ID,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.expenses).toHaveLength(3)
      expect(body.summary).toHaveLength(2)

      const p1Summary = body.summary.find(
        (s: { participantId: string }) => s.participantId === p1.participantId
      )
      expect(p1Summary).toBeDefined()
      expect(p1Summary.totalAmount).toBe(76.5)

      const p2Summary = body.summary.find(
        (s: { participantId: string }) => s.participantId === p2.participantId
      )
      expect(p2Summary).toBeDefined()
      expect(p2Summary.totalAmount).toBe(25.5)
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${nonExistentId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 401 without JWT', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/expenses`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /plans/:planId/expenses', () => {
    it('creates an expense and returns 201', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: participants[0].participantId,
          amount: 42.5,
          description: 'Firewood',
        },
      })

      expect(response.statusCode).toBe(201)
      const expense = response.json()
      expect(expense.expenseId).toBeDefined()
      expect(expense.participantId).toBe(participants[0].participantId)
      expect(expense.planId).toBe(plan.planId)
      expect(expense.amount).toBe('42.50')
      expect(expense.description).toBe('Firewood')
      expect(expense.createdByUserId).toBe(TEST_USER_ID)
    })

    it('creates an expense without description', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: participants[0].participantId,
          amount: 10,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().description).toBeNull()
    })

    it('linked participant can add expense for themselves', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const selfParticipant = await seedTestParticipantWithUser(
        plan.planId,
        OTHER_USER_ID
      )
      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: {
          participantId: selfParticipant.participantId,
          amount: 30,
          description: 'Gas',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().createdByUserId).toBe(OTHER_USER_ID)
    })

    it('returns 403 when participant adds expense for someone else', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 2, {
        ownerUserId: TEST_USER_ID,
      })
      const otherParticipant = participants.find((p) => p.role !== 'owner')!

      await seedTestParticipantWithUser(plan.planId, OTHER_USER_ID)
      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: {
          participantId: otherParticipant.participantId,
          amount: 50,
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('owner can add expense for any participant', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 2, {
        ownerUserId: TEST_USER_ID,
      })
      const nonOwner = participants.find((p) => p.role !== 'owner')!

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: nonOwner.participantId,
          amount: 100,
          description: 'Supplies',
        },
      })

      expect(response.statusCode).toBe(201)
    })

    it('admin can add expense for any participant', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1)

      const adminToken = await signTestJwt({
        sub: ADMIN_USER_ID,
        app_metadata: { role: 'admin' },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          participantId: participants[0].participantId,
          amount: 200,
        },
      })

      expect(response.statusCode).toBe(201)
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${nonExistentId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: '11111111-1111-1111-1111-111111111111',
          amount: 10,
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when participant not in plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const participants = await seedTestParticipants(plan2.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan1.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: participants[0].participantId,
          amount: 10,
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toBe('Participant not found in this plan')
    })

    it('returns 400 when amount is missing', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: participants[0].participantId,
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when amount is 0', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: participants[0].participantId,
          amount: 0,
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when amount is negative', async () => {
      const [plan] = await seedTestPlans(1)
      const participants = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          participantId: participants[0].participantId,
          amount: -5,
        },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PATCH /expenses/:expenseId', () => {
    it('updates amount and returns 200', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 99.99 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().amount).toBe('99.99')
    })

    it('updates description and returns 200', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { description: 'Updated description' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().description).toBe('Updated description')
    })

    it('clears description by sending null', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { description: null },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().description).toBeNull()
    })

    it('returns 400 when no fields provided', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 when expense does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${nonExistentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 50 },
      })

      expect(response.statusCode).toBe(404)
    })

    it('expense participant can update their own expense', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const selfParticipant = await seedTestParticipantWithUser(
        plan.planId,
        OTHER_USER_ID
      )
      const [expense] = await seedTestExpenses(
        plan.planId,
        selfParticipant.participantId,
        1,
        { createdByUserId: OTHER_USER_ID }
      )

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { amount: 77 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().amount).toBe('77.00')
    })

    it('participant can update expense created by owner for them', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const selfParticipant = await seedTestParticipantWithUser(
        plan.planId,
        OTHER_USER_ID
      )
      const [expense] = await seedTestExpenses(
        plan.planId,
        selfParticipant.participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { amount: 55 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().amount).toBe('55.00')
    })

    it('returns 403 when a different participant tries to update', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const seededParticipants = await seedTestParticipants(plan.planId, 1)
      await seedTestParticipantWithUser(plan.planId, TEST_USER_ID)
      const [expense] = await seedTestExpenses(
        plan.planId,
        seededParticipants[0].participantId,
        1,
        { createdByUserId: OTHER_USER_ID }
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 999 },
      })

      expect(response.statusCode).toBe(403)
    })

    it('admin can update any expense', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1)
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: OTHER_USER_ID }
      )

      const adminToken = await signTestJwt({
        sub: ADMIN_USER_ID,
        app_metadata: { role: 'admin' },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { amount: 500 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().amount).toBe('500.00')
    })
  })

  describe('DELETE /expenses/:expenseId', () => {
    it('deletes an expense and returns 200', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const response = await app.inject({
        method: 'DELETE',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/expenses`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(getResponse.json().expenses).toHaveLength(0)
    })

    it('returns 404 when expense does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/expenses/${nonExistentId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('expense participant can delete their own expense', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const selfParticipant = await seedTestParticipantWithUser(
        plan.planId,
        OTHER_USER_ID
      )
      const [expense] = await seedTestExpenses(
        plan.planId,
        selfParticipant.participantId,
        1,
        { createdByUserId: OTHER_USER_ID }
      )

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'DELETE',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('participant can delete expense created by owner for them', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      const selfParticipant = await seedTestParticipantWithUser(
        plan.planId,
        OTHER_USER_ID
      )
      const [expense] = await seedTestExpenses(
        plan.planId,
        selfParticipant.participantId,
        1,
        { createdByUserId: TEST_USER_ID }
      )

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })

      const response = await app.inject({
        method: 'DELETE',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('returns 403 when a different participant tries to delete', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const seededParticipants = await seedTestParticipants(plan.planId, 1)
      await seedTestParticipantWithUser(plan.planId, TEST_USER_ID)
      const [expense] = await seedTestExpenses(
        plan.planId,
        seededParticipants[0].participantId,
        1,
        { createdByUserId: OTHER_USER_ID }
      )

      const response = await app.inject({
        method: 'DELETE',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('admin can delete any expense', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OTHER_USER_ID,
      })
      const participants = await seedTestParticipants(plan.planId, 1)
      const [expense] = await seedTestExpenses(
        plan.planId,
        participants[0].participantId,
        1,
        { createdByUserId: OTHER_USER_ID }
      )

      const adminToken = await signTestJwt({
        sub: ADMIN_USER_ID,
        app_metadata: { role: 'admin' },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/expenses/${expense.expenseId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })
  })
})
