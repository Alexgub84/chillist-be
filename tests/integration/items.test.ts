import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'

describe('Items Route', () => {
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

  describe('POST /plans/:planId/items', () => {
    it('creates equipment item with required fields and returns 201', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 2,
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(201)

      const item = response.json()
      expect(item.itemId).toBeDefined()
      expect(item.planId).toBe(plan.planId)
      expect(item.name).toBe('Tent')
      expect(item.category).toBe('equipment')
      expect(item.quantity).toBe(2)
      expect(item.unit).toBe('pcs')
      expect(item.status).toBe('pending')
      expect(item.notes).toBeNull()
      expect(item.createdAt).toBeDefined()
      expect(item.updatedAt).toBeDefined()
    })

    it('creates equipment item with optional notes', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Sleeping Bag',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          notes: 'Bring the warm one',
        },
      })

      expect(response.statusCode).toBe(201)

      const item = response.json()
      expect(item.name).toBe('Sleeping Bag')
      expect(item.notes).toBe('Bring the warm one')
      expect(item.unit).toBe('pcs')
    })

    it('creates food item with required unit and returns 201', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Rice',
          category: 'food',
          quantity: 2,
          unit: 'kg',
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(201)

      const item = response.json()
      expect(item.name).toBe('Rice')
      expect(item.category).toBe('food')
      expect(item.quantity).toBe(2)
      expect(item.unit).toBe('kg')
      expect(item.status).toBe('pending')
    })

    it('creates food item with all optional fields', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Water',
          category: 'food',
          quantity: 5,
          unit: 'l',
          status: 'purchased',
          notes: 'Spring water preferred',
        },
      })

      expect(response.statusCode).toBe(201)

      const item = response.json()
      expect(item.name).toBe('Water')
      expect(item.unit).toBe('l')
      expect(item.status).toBe('purchased')
      expect(item.notes).toBe('Spring water preferred')
    })

    it('allows food item with any valid unit', async () => {
      const [plan] = await seedTestPlans(1)
      const validUnits = [
        'pcs',
        'kg',
        'g',
        'lb',
        'oz',
        'l',
        'ml',
        'pack',
        'set',
      ]

      for (const unit of validUnits) {
        const response = await app.inject({
          method: 'POST',
          url: `/plans/${plan.planId}/items`,
          payload: {
            name: `Food with ${unit}`,
            category: 'food',
            quantity: 1,
            unit,
            status: 'pending',
          },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json().unit).toBe(unit)
      }
    })

    it('returns 400 when food item is missing unit', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Rice',
          category: 'food',
          quantity: 2,
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${nonExistentId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it.each([
      ['name', { category: 'equipment', quantity: 1, status: 'pending' }],
      ['category', { name: 'Tent', quantity: 1, status: 'pending' }],
      ['quantity', { name: 'Tent', category: 'equipment', status: 'pending' }],
      ['status', { name: 'Tent', category: 'equipment', quantity: 1 }],
    ])('returns 400 when %s is missing', async (_field, payload) => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([
      [
        'category',
        { name: 'X', category: 'clothing', quantity: 1, status: 'pending' },
      ],
      [
        'unit',
        {
          name: 'X',
          category: 'food',
          quantity: 1,
          unit: 'cups',
          status: 'pending',
        },
      ],
      [
        'status',
        { name: 'X', category: 'equipment', quantity: 1, status: 'lost' },
      ],
    ])('returns 400 for invalid %s value', async (_field, payload) => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([0, -1])('returns 400 when quantity is %i', async (quantity) => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity,
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when name is empty string', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: '',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for invalid planId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/invalid-uuid/items',
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('created item is retrievable via GET /plans/:planId', async () => {
      const [plan] = await seedTestPlans(1)

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Backpack',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
        },
      })

      const createdItem = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(getResponse.statusCode).toBe(200)

      const fetchedPlan = getResponse.json()
      expect(fetchedPlan.items).toHaveLength(1)
      expect(fetchedPlan.items[0].itemId).toBe(createdItem.itemId)
      expect(fetchedPlan.items[0].name).toBe('Backpack')
      expect(fetchedPlan.items[0].unit).toBe('pcs')
    })
  })
})
