import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  setupTestDatabase,
} from '../helpers/db.js'
import { setupTestKeys, getTestJWKS, getTestIssuer } from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import {
  plans,
  participants,
  items,
  participantExpenses,
} from '../../src/db/schema.js'

const VALID_SERVICE_KEY = 'test-service-key-expenses-abc123'
const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-2222-3333-4444-555555555555'

describe('Internal Expenses — POST /api/internal/plans/:planId/expenses', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()

    process.env.CHATBOT_SERVICE_KEY = VALID_SERVICE_KEY

    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  }, 30000)

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
    delete process.env.CHATBOT_SERVICE_KEY
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  async function createExpense(
    planId: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/internal/plans/${planId}/expenses`,
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        'content-type': 'application/json',
        ...headers,
      },
      payload: body,
    })
  }

  describe('Auth', () => {
    it('returns 401 when x-service-key is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await app.inject({
        method: 'POST',
        url: `/api/internal/plans/${fakeId}/expenses`,
        headers: {
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { amount: 10 },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 with invalid x-service-key', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await app.inject({
        method: 'POST',
        url: `/api/internal/plans/${fakeId}/expenses`,
        headers: {
          'x-service-key': 'wrong-key',
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { amount: 10 },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await createExpense(fakeId, { amount: 10 })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Errors', () => {
    it('returns 404 when plan does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099'
      const response = await createExpense(
        fakeId,
        { amount: 25 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Plan not found' })
    })

    it('returns 403 when user is not a participant on the plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Someone else plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Owner',
        lastName: 'Only',
        contactPhone: '+972500000001',
        userId: OTHER_USER_ID,
        role: 'owner',
      })

      const response = await createExpense(
        plan.planId,
        { amount: 15 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'User is not a participant on this plan',
      })
    })

    it('returns 400 when itemIds contain non-existent IDs', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Test Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
      })

      const fakeItemId = '00000000-0000-0000-0000-000000000077'
      const response = await createExpense(
        plan.planId,
        { amount: 50, itemIds: [fakeItemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('Items not found in this plan')
    })

    it('returns 400 when itemIds belong to a different plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'My Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [otherPlan] = await db
        .insert(plans)
        .values({
          title: 'Other Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
      })

      const [otherItem] = await db
        .insert(items)
        .values({
          planId: otherPlan.planId,
          name: 'Cross-plan item',
          category: 'food',
          assignmentStatusList: [],
        })
        .returning()

      const response = await createExpense(
        plan.planId,
        { amount: 50, itemIds: [otherItem.itemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('Items not found in this plan')
    })

    it('returns 400 for zero amount', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Test Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
      })

      const response = await createExpense(
        plan.planId,
        { amount: 0 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for negative amount', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Test Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
      })

      const response = await createExpense(
        plan.planId,
        { amount: -5 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })
  })

  describe('Happy path', () => {
    it('creates expense with amount only', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const response = await createExpense(
        plan.planId,
        { amount: 29.99 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.participantId).toBe(p.participantId)
      expect(body.planId).toBe(plan.planId)
      expect(body.amount).toBe('29.99')
      expect(body.description).toBeNull()
      expect(body.itemIds).toEqual([])
      expect(body.createdByUserId).toBe(USER_ID)
      expect(body.expenseId).toBeDefined()
    })

    it('creates expense with description and itemIds', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Tent',
          category: 'group_equipment',
          assignmentStatusList: [
            { participantId: p.participantId, status: 'pending' },
          ],
        })
        .returning()

      const response = await createExpense(
        plan.planId,
        { amount: 150, description: 'Bought a tent', itemIds: [item.itemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.description).toBe('Bought a tent')
      expect(body.itemIds).toEqual([item.itemId])
    })

    it('advances linked item status from pending to purchased', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Firewood',
          category: 'group_equipment',
          assignmentStatusList: [
            { participantId: p.participantId, status: 'pending' },
          ],
        })
        .returning()

      await createExpense(
        plan.planId,
        { amount: 20, itemIds: [item.itemId] },
        { 'x-user-id': USER_ID }
      )

      const [updatedItem] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(updatedItem!.assignmentStatusList).toEqual([
        { participantId: p.participantId, status: 'purchased' },
      ])
    })

    it('does not advance already purchased or packed items', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Already packed',
          category: 'food',
          assignmentStatusList: [
            { participantId: p.participantId, status: 'packed' },
          ],
        })
        .returning()

      await createExpense(
        plan.planId,
        { amount: 30, itemIds: [item.itemId] },
        { 'x-user-id': USER_ID }
      )

      const [updatedItem] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(updatedItem!.assignmentStatusList).toEqual([
        { participantId: p.participantId, status: 'packed' },
      ])
    })

    it('accepts empty itemIds array and stores as empty', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const response = await createExpense(
        plan.planId,
        { amount: 10, itemIds: [] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      expect(response.json().itemIds).toEqual([])
    })

    it('advances only pending items in a multi-item batch', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const [pendingItem] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Pending item',
          category: 'food',
          assignmentStatusList: [
            { participantId: p.participantId, status: 'pending' },
          ],
        })
        .returning()

      const [packedItem] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Packed item',
          category: 'group_equipment',
          assignmentStatusList: [
            { participantId: p.participantId, status: 'packed' },
          ],
        })
        .returning()

      await createExpense(
        plan.planId,
        { amount: 100, itemIds: [pendingItem.itemId, packedItem.itemId] },
        { 'x-user-id': USER_ID }
      )

      const [updatedPending] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, pendingItem.itemId))

      const [updatedPacked] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, packedItem.itemId))

      expect(updatedPending!.assignmentStatusList[0].status).toBe('purchased')
      expect(updatedPacked!.assignmentStatusList[0].status).toBe('packed')
    })

    it('does not change items where the participant has no assignment entry', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const [otherP] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Other',
          lastName: 'Person',
          contactPhone: '+972509999999',
          userId: OTHER_USER_ID,
          role: 'participant',
        })
        .returning()

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Assigned to other',
          category: 'food',
          assignmentStatusList: [
            { participantId: otherP.participantId, status: 'pending' },
          ],
        })
        .returning()

      const response = await createExpense(
        plan.planId,
        { amount: 25, itemIds: [item.itemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)

      const [updatedItem] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(updatedItem!.assignmentStatusList).toEqual([
        { participantId: otherP.participantId, status: 'pending' },
      ])
    })

    it('stores expense in DB', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      const response = await createExpense(
        plan.planId,
        { amount: 42.5 },
        { 'x-user-id': USER_ID }
      )

      const body = response.json()

      const [row] = await db
        .select()
        .from(participantExpenses)
        .where(eq(participantExpenses.expenseId, body.expenseId))

      expect(row).toBeDefined()
      expect(row!.participantId).toBe(p.participantId)
      expect(row!.planId).toBe(plan.planId)
      expect(Number(row!.amount)).toBe(42.5)
    })
  })
})

describe('Internal Expenses — PATCH /api/internal/expenses/:expenseId', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()

    process.env.CHATBOT_SERVICE_KEY = VALID_SERVICE_KEY

    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  }, 30000)

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
    delete process.env.CHATBOT_SERVICE_KEY
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  async function updateExpense(
    expenseId: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/internal/expenses/${expenseId}`,
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        'content-type': 'application/json',
        ...headers,
      },
      payload: body,
    })
  }

  async function seedPlanWithExpense(opts?: { itemIds?: string[] }) {
    const [plan] = await db
      .insert(plans)
      .values({
        title: 'Trip',
        status: 'active',
        visibility: 'invite_only',
      })
      .returning()

    const [p] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
      })
      .returning()

    const [expense] = await db
      .insert(participantExpenses)
      .values({
        participantId: p.participantId,
        planId: plan.planId,
        amount: '50.00',
        description: 'Initial expense',
        itemIds: opts?.itemIds ?? [],
        createdByUserId: USER_ID,
      })
      .returning()

    return { plan, participant: p, expense }
  }

  describe('Auth', () => {
    it('returns 401 when x-service-key is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/expenses/${fakeId}`,
        headers: {
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { amount: 10 },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 with invalid x-service-key', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/expenses/${fakeId}`,
        headers: {
          'x-service-key': 'wrong-key',
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { amount: 10 },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await updateExpense(fakeId, { amount: 10 })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Errors', () => {
    it('returns 404 when expense does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099'
      const response = await updateExpense(
        fakeId,
        { amount: 25 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Expense not found' })
    })

    it('returns 403 when user is not the expense participant', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        { amount: 75 },
        { 'x-user-id': OTHER_USER_ID }
      )

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'You can only edit your own expenses',
      })
    })

    it('returns 400 when body is empty', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        {},
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        message: 'No fields to update',
      })
    })

    it('returns 400 when itemIds contain non-existent IDs', async () => {
      const { expense } = await seedPlanWithExpense()

      const fakeItemId = '00000000-0000-0000-0000-000000000077'
      const response = await updateExpense(
        expense.expenseId,
        { itemIds: [fakeItemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('Items not found in this plan')
    })

    it('returns 400 when itemIds belong to a different plan', async () => {
      const { expense } = await seedPlanWithExpense()

      const [otherPlan] = await db
        .insert(plans)
        .values({
          title: 'Other Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [otherItem] = await db
        .insert(items)
        .values({
          planId: otherPlan.planId,
          name: 'Cross-plan item',
          category: 'food',
          assignmentStatusList: [],
        })
        .returning()

      const response = await updateExpense(
        expense.expenseId,
        { itemIds: [otherItem.itemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('Items not found in this plan')
    })

    it('returns 400 for zero amount', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        { amount: 0 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for negative amount', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        { amount: -5 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })
  })

  describe('Happy path', () => {
    it('updates amount only', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        { amount: 99.99 },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.amount).toBe('99.99')
      expect(body.description).toBe('Initial expense')
      expect(body.itemIds).toEqual([])
    })

    it('updates description', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        { description: 'Updated note' },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().description).toBe('Updated note')
    })

    it('clears description with null', async () => {
      const { expense } = await seedPlanWithExpense()

      const response = await updateExpense(
        expense.expenseId,
        { description: null },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().description).toBeNull()
    })

    it('adds itemIds to an expense that had none', async () => {
      const { plan, participant, expense } = await seedPlanWithExpense()

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Tent',
          category: 'group_equipment',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'pending' },
          ],
        })
        .returning()

      const response = await updateExpense(
        expense.expenseId,
        { itemIds: [item.itemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().itemIds).toEqual([item.itemId])

      const [updatedItem] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(updatedItem!.assignmentStatusList[0].status).toBe('purchased')
    })

    it('advances only newly added items when replacing itemIds', async () => {
      const { plan, participant, expense } = await seedPlanWithExpense()

      const [oldItem] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Old item',
          category: 'food',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'purchased' },
          ],
        })
        .returning()

      await db
        .update(participantExpenses)
        .set({ itemIds: [oldItem.itemId] })
        .where(eq(participantExpenses.expenseId, expense.expenseId))

      const [newItem] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'New item',
          category: 'food',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'pending' },
          ],
        })
        .returning()

      const response = await updateExpense(
        expense.expenseId,
        { itemIds: [oldItem.itemId, newItem.itemId] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().itemIds).toEqual([oldItem.itemId, newItem.itemId])

      const [updatedNew] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, newItem.itemId))

      expect(updatedNew!.assignmentStatusList[0].status).toBe('purchased')
    })

    it('clears itemIds when sending empty array', async () => {
      const { plan, participant, expense } = await seedPlanWithExpense()

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Some item',
          category: 'food',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'purchased' },
          ],
        })
        .returning()

      await db
        .update(participantExpenses)
        .set({ itemIds: [item.itemId] })
        .where(eq(participantExpenses.expenseId, expense.expenseId))

      const response = await updateExpense(
        expense.expenseId,
        { itemIds: [] },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().itemIds).toEqual([])
    })

    it('persists updated values in DB', async () => {
      const { expense } = await seedPlanWithExpense()

      await updateExpense(
        expense.expenseId,
        { amount: 123.45, description: 'DB check' },
        { 'x-user-id': USER_ID }
      )

      const [row] = await db
        .select()
        .from(participantExpenses)
        .where(eq(participantExpenses.expenseId, expense.expenseId))

      expect(Number(row!.amount)).toBe(123.45)
      expect(row!.description).toBe('DB check')
    })
  })
})
