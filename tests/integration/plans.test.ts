import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestPlans,
  seedTestItems,
  setupTestDatabase,
} from '../helpers/db.js'

describe('Plans Route', () => {
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

  describe('GET /plans', () => {
    it('returns empty array when no plans exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns all plans when plans exist', async () => {
      await seedTestPlans(3)

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      expect(response.statusCode).toBe(200)

      const plans = response.json()
      expect(plans).toHaveLength(3)

      expect(plans[0]).toMatchObject({
        title: 'Test Plan 1',
        description: 'Description for test plan 1',
        status: 'active',
        visibility: 'public',
      })

      expect(plans[0].planId).toBeDefined()
      expect(plans[0].createdAt).toBeDefined()
      expect(plans[0].updatedAt).toBeDefined()
    })

    it('returns plans ordered by createdAt', async () => {
      await seedTestPlans(3)

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      const plans = response.json()

      const createdAtDates = plans.map((p: { createdAt: string }) =>
        new Date(p.createdAt).getTime()
      )
      const sortedDates = [...createdAtDates].sort((a, b) => a - b)

      expect(createdAtDates).toEqual(sortedDates)
    })

    it('returns plans with correct structure', async () => {
      await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      const [plan] = response.json()

      expect(plan).toHaveProperty('planId')
      expect(plan).toHaveProperty('title')
      expect(plan).toHaveProperty('description')
      expect(plan).toHaveProperty('status')
      expect(plan).toHaveProperty('visibility')
      expect(plan).toHaveProperty('ownerParticipantId')
      expect(plan).toHaveProperty('location')
      expect(plan).toHaveProperty('startDate')
      expect(plan).toHaveProperty('endDate')
      expect(plan).toHaveProperty('tags')
      expect(plan).toHaveProperty('createdAt')
      expect(plan).toHaveProperty('updatedAt')
    })
  })

  describe('GET /plans/:planId', () => {
    it('returns plan when it exists', async () => {
      const [seededPlan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      expect(response.statusCode).toBe(200)

      const plan = response.json()
      expect(plan.planId).toBe(seededPlan.planId)
      expect(plan.title).toBe('Test Plan 1')
      expect(plan.description).toBe('Description for test plan 1')
      expect(plan.status).toBe('active')
      expect(plan.visibility).toBe('public')
      expect(plan.items).toEqual([])
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${nonExistentId}`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/invalid-uuid',
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns plan with correct structure including items', async () => {
      const [seededPlan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      const plan = response.json()

      expect(plan).toHaveProperty('planId')
      expect(plan).toHaveProperty('title')
      expect(plan).toHaveProperty('description')
      expect(plan).toHaveProperty('status')
      expect(plan).toHaveProperty('visibility')
      expect(plan).toHaveProperty('ownerParticipantId')
      expect(plan).toHaveProperty('location')
      expect(plan).toHaveProperty('startDate')
      expect(plan).toHaveProperty('endDate')
      expect(plan).toHaveProperty('tags')
      expect(plan).toHaveProperty('createdAt')
      expect(plan).toHaveProperty('updatedAt')
      expect(plan).toHaveProperty('items')
      expect(Array.isArray(plan.items)).toBe(true)
    })

    it('returns correct plan among multiple plans', async () => {
      const seededPlans = await seedTestPlans(3)
      const targetPlan = seededPlans[1]

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${targetPlan.planId}`,
      })

      expect(response.statusCode).toBe(200)

      const plan = response.json()
      expect(plan.planId).toBe(targetPlan.planId)
      expect(plan.title).toBe('Test Plan 2')
    })

    it('returns plan with associated items', async () => {
      const [seededPlan] = await seedTestPlans(1)
      const seededItems = await seedTestItems(seededPlan.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      expect(response.statusCode).toBe(200)

      const plan = response.json()
      expect(plan.items).toHaveLength(3)

      const itemIds = plan.items.map((item: { itemId: string }) => item.itemId)
      for (const seededItem of seededItems) {
        expect(itemIds).toContain(seededItem.itemId)
      }
    })

    it('returns items with correct structure', async () => {
      const [seededPlan] = await seedTestPlans(1)
      await seedTestItems(seededPlan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      const plan = response.json()
      const [item] = plan.items

      expect(item).toHaveProperty('itemId')
      expect(item).toHaveProperty('planId')
      expect(item).toHaveProperty('name')
      expect(item).toHaveProperty('category')
      expect(item).toHaveProperty('quantity')
      expect(item).toHaveProperty('unit')
      expect(item).toHaveProperty('status')
      expect(item).toHaveProperty('notes')
      expect(item).toHaveProperty('createdAt')
      expect(item).toHaveProperty('updatedAt')

      expect(item.planId).toBe(seededPlan.planId)
      expect(item.name).toBe('Test Item 1')
      expect(item.category).toBe('equipment')
      expect(item.quantity).toBe(1)
      expect(item.unit).toBe('pcs')
      expect(item.status).toBe('pending')
    })

    it('returns only items belonging to the requested plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestItems(plan1.planId, 2)
      await seedTestItems(plan2.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan1.planId}`,
      })

      const plan = response.json()
      expect(plan.items).toHaveLength(2)

      for (const item of plan.items) {
        expect(item.planId).toBe(plan1.planId)
      }
    })
  })
})
