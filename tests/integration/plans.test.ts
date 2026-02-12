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
    app = await buildApp({ db }, { logger: false })
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

  describe('POST /plans', () => {
    it('creates plan with title only and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        payload: { title: 'Weekend Camping' },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.title).toBe('Weekend Camping')
      expect(plan.planId).toBeDefined()
      expect(plan.status).toBe('draft')
      expect(plan.visibility).toBe('public')
      expect(plan.description).toBeNull()
      expect(plan.location).toBeNull()
      expect(plan.startDate).toBeNull()
      expect(plan.endDate).toBeNull()
      expect(plan.tags).toBeNull()
      expect(plan.createdAt).toBeDefined()
      expect(plan.updatedAt).toBeDefined()
    })

    it('creates plan with all optional fields', async () => {
      const payload = {
        title: 'Beach Trip',
        description: 'A fun beach trip',
        visibility: 'private',
        location: {
          locationId: 'loc-1',
          name: 'Malibu Beach',
          country: 'US',
          city: 'Malibu',
        },
        startDate: '2026-03-01T10:00:00.000Z',
        endDate: '2026-03-05T18:00:00.000Z',
        tags: ['beach', 'vacation'],
      }

      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        payload,
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.title).toBe('Beach Trip')
      expect(plan.description).toBe('A fun beach trip')
      expect(plan.visibility).toBe('private')
      expect(plan.location).toMatchObject({
        locationId: 'loc-1',
        name: 'Malibu Beach',
        country: 'US',
        city: 'Malibu',
      })
      expect(plan.startDate).toBe('2026-03-01T10:00:00.000Z')
      expect(plan.endDate).toBe('2026-03-05T18:00:00.000Z')
      expect(plan.tags).toEqual(['beach', 'vacation'])
    })

    it('returns 400 when title is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        payload: { description: 'No title provided' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when title is empty string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        payload: { title: '' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('created plan is retrievable via GET', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans',
        payload: { title: 'Retrievable Plan' },
      })

      const createdPlan = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}`,
      })

      expect(getResponse.statusCode).toBe(200)

      const fetchedPlan = getResponse.json()
      expect(fetchedPlan.planId).toBe(createdPlan.planId)
      expect(fetchedPlan.title).toBe('Retrievable Plan')
      expect(fetchedPlan.items).toEqual([])
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

  describe('DELETE /plans/:planId', () => {
    it('deletes plan and returns 200 with ok true', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('deleted plan is no longer retrievable via GET', async () => {
      const [plan] = await seedTestPlans(1)

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(getResponse.statusCode).toBe(404)
    })

    it('deleted plan is removed from list', async () => {
      const [plan1, plan2] = await seedTestPlans(2)

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan1.planId}`,
      })

      const listResponse = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      const plans = listResponse.json()
      expect(plans).toHaveLength(1)
      expect(plans[0].planId).toBe(plan2.planId)
    })

    it('cascade deletes related items', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestItems(plan.planId, 3)

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(200)

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(getResponse.statusCode).toBe(404)
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${nonExistentId}`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/plans/invalid-uuid',
      })

      expect(response.statusCode).toBe(400)
    })

    it('does not affect other plans', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestItems(plan1.planId, 2)
      await seedTestItems(plan2.planId, 3)

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan1.planId}`,
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan2.planId}`,
      })

      expect(getResponse.statusCode).toBe(200)

      const plan = getResponse.json()
      expect(plan.planId).toBe(plan2.planId)
      expect(plan.items).toHaveLength(3)
    })
  })
})
