import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestItems,
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

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('Items Route', () => {
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
        headers: { authorization: `Bearer ${token}` },
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
      expect(item.subcategory).toBeNull()
      expect(item.notes).toBeNull()
      expect(item.assignedParticipantId).toBeNull()
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
          subcategory: 'beverages',
          notes: 'Spring water preferred',
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(201)

      const item = response.json()
      expect(item.name).toBe('Water')
      expect(item.unit).toBe('l')
      expect(item.status).toBe('purchased')
      expect(item.subcategory).toBe('beverages')
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
          headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      })

      const createdItem = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(getResponse.statusCode).toBe(200)

      const fetchedPlan = getResponse.json()
      expect(fetchedPlan.items).toHaveLength(1)
      expect(fetchedPlan.items[0].itemId).toBe(createdItem.itemId)
      expect(fetchedPlan.items[0].name).toBe('Backpack')
      expect(fetchedPlan.items[0].unit).toBe('pcs')
    })
  })

  describe('GET /plans/:planId/items', () => {
    it('returns 200 with empty array when plan has no items', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns 200 with all items for a plan', async () => {
      const [plan] = await seedTestPlans(1)
      const seededItems = await seedTestItems(plan.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const items = response.json()
      expect(items).toHaveLength(3)

      const firstItem = items[0]
      expect(firstItem.itemId).toBe(seededItems[0].itemId)
      expect(firstItem.planId).toBe(plan.planId)
      expect(firstItem.name).toBe('Test Item 1')
      expect(firstItem.category).toBe('equipment')
      expect(firstItem.quantity).toBe(1)
      expect(firstItem.unit).toBe('pcs')
      expect(firstItem.status).toBe('pending')
      expect(firstItem.createdAt).toBeDefined()
      expect(firstItem.updatedAt).toBeDefined()
    })

    it('returns only items belonging to the requested plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestItems(plan1.planId, 2)
      await seedTestItems(plan2.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan1.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const items = response.json()
      expect(items).toHaveLength(2)
      items.forEach((item: { planId: string }) => {
        expect(item.planId).toBe(plan1.planId)
      })
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${nonExistentId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns 400 for invalid planId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/invalid-uuid/items',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PATCH /items/:itemId', () => {
    it('updates item name and returns 200', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { name: 'Updated Tent' },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.itemId).toBe(item.itemId)
      expect(updated.name).toBe('Updated Tent')
      expect(updated.category).toBe(item.category)
      expect(updated.quantity).toBe(item.quantity)
      expect(updated.unit).toBe(item.unit)
      expect(updated.status).toBe(item.status)
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(item.updatedAt).getTime()
      )
    })

    it('updates multiple fields at once', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          name: 'Granola Bars',
          category: 'food',
          quantity: 5,
          unit: 'pack',
          status: 'purchased',
          subcategory: 'snacks',
          notes: 'Chocolate flavor',
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.name).toBe('Granola Bars')
      expect(updated.category).toBe('food')
      expect(updated.quantity).toBe(5)
      expect(updated.unit).toBe('pack')
      expect(updated.status).toBe('purchased')
      expect(updated.subcategory).toBe('snacks')
      expect(updated.notes).toBe('Chocolate flavor')
    })

    it('updates status only', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { status: 'packed' },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('packed')
    })

    it('sets notes to null', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { notes: 'Some note' },
        headers: { authorization: `Bearer ${token}` },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { notes: null },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().notes).toBeNull()
    })

    it('sets subcategory and clears it with null', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const setResponse = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { subcategory: 'cooking' },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(setResponse.statusCode).toBe(200)
      expect(setResponse.json().subcategory).toBe('cooking')

      const clearResponse = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { subcategory: null },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(clearResponse.statusCode).toBe(200)
      expect(clearResponse.json().subcategory).toBeNull()
    })

    it('returns 404 when item does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${nonExistentId}`,
        payload: { name: 'Ghost Item' },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Item not found',
      })
    })

    it('returns 400 for invalid itemId format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/items/invalid-uuid',
        payload: { name: 'Test' },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([
      ['category', { category: 'clothing' }],
      ['unit', { unit: 'cups' }],
      ['status', { status: 'lost' }],
    ])('returns 400 for invalid %s value', async (_field, payload) => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([0, -1])('returns 400 when quantity is %i', async (quantity) => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { quantity },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when name is empty string', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { name: '' },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it('persists update when fetched via GET', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { name: 'Persisted Name', status: 'purchased' },
        headers: { authorization: `Bearer ${token}` },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(getResponse.statusCode).toBe(200)
      const items = getResponse.json()
      const found = items.find(
        (i: { itemId: string }) => i.itemId === item.itemId
      )
      expect(found.name).toBe('Persisted Name')
      expect(found.status).toBe('purchased')
    })
  })

  describe('Item assignment (assignedParticipantId)', () => {
    it('creates item with assignedParticipantId', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignedParticipantId: participant.participantId,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().assignedParticipantId).toBe(
        participant.participantId
      )
    })

    it('assigns participant to item via PATCH', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)
      const [item] = await seedTestItems(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { assignedParticipantId: participant.participantId },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().assignedParticipantId).toBe(
        participant.participantId
      )
    })

    it('unassigns participant from item via PATCH with null', async () => {
      const [plan] = await seedTestPlans(1)
      const [participant] = await seedTestParticipants(plan.planId, 1)

      const createResponse = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignedParticipantId: participant.participantId,
        },
        headers: { authorization: `Bearer ${token}` },
      })
      const item = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { assignedParticipantId: null },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().assignedParticipantId).toBeNull()
    })

    it('returns 400 when assignedParticipantId does not exist on POST', async () => {
      const [plan] = await seedTestPlans(1)
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignedParticipantId: nonExistentId,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 when assignedParticipantId does not exist on PATCH', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { assignedParticipantId: nonExistentId },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ message: 'Participant not found' })
    })

    it('returns 400 when participant belongs to a different plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const [participantFromPlan2] = await seedTestParticipants(plan2.planId, 1)
      const [item] = await seedTestItems(plan1.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: {
          assignedParticipantId: participantFromPlan2.participantId,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        message: 'Participant does not belong to this plan',
      })
    })

    it('returns 400 when participant belongs to a different plan on POST', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const [participantFromPlan2] = await seedTestParticipants(plan2.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan1.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 1,
          status: 'pending',
          assignedParticipantId: participantFromPlan2.participantId,
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        message: 'Participant does not belong to this plan',
      })
    })
  })

  describe('POST /plans/:planId/items/bulk', () => {
    it('creates multiple items and returns 200 with all items', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'equipment',
              quantity: 2,
              status: 'pending',
            },
            {
              name: 'Water',
              category: 'food',
              quantity: 5,
              unit: 'l',
              status: 'pending',
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items).toHaveLength(2)
      expect(body.errors).toHaveLength(0)
      expect(body.items[0].name).toBe('Tent')
      expect(body.items[0].unit).toBe('pcs')
      expect(body.items[1].name).toBe('Water')
      expect(body.items[1].unit).toBe('l')
    })

    it('returns 207 with partial success when some items fail validation', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'equipment',
              quantity: 1,
              status: 'pending',
            },
            { name: 'Rice', category: 'food', quantity: 2, status: 'pending' },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].name).toBe('Tent')
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toEqual({
        name: 'Rice',
        message: 'Unit is required for food items',
      })
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${nonExistentId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'equipment',
              quantity: 1,
              status: 'pending',
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 400 when items array is empty', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: { items: [] },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it('reports participant not found in errors', async () => {
      const [plan] = await seedTestPlans(1)
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'equipment',
              quantity: 1,
              status: 'pending',
              assignedParticipantId: nonExistentId,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(0)
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toEqual({
        name: 'Tent',
        message: 'Participant not found',
      })
    })
  })

  describe('PATCH /plans/:planId/items/bulk', () => {
    it('updates multiple items and returns 200', async () => {
      const [plan] = await seedTestPlans(1)
      const seededItems = await seedTestItems(plan.planId, 2)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            { itemId: seededItems[0].itemId, status: 'purchased' },
            { itemId: seededItems[1].itemId, name: 'Updated Name' },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items).toHaveLength(2)
      expect(body.errors).toHaveLength(0)
      expect(body.items[0].status).toBe('purchased')
      expect(body.items[1].name).toBe('Updated Name')
    })

    it('returns 207 when some items are not found', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            { itemId: item.itemId, status: 'packed' },
            { itemId: fakeId, name: 'Ghost', status: 'pending' },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].status).toBe('packed')
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toEqual({
        name: 'Ghost',
        message: 'Item not found',
      })
    })

    it('reports items from another plan in errors', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const [itemPlan1] = await seedTestItems(plan1.planId, 1)
      const [itemPlan2] = await seedTestItems(plan2.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan1.planId}/items/bulk`,
        payload: {
          items: [
            { itemId: itemPlan1.itemId, status: 'purchased' },
            { itemId: itemPlan2.itemId, status: 'purchased' },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(1)
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0].message).toBe('Item does not belong to this plan')
    })

    it('returns 400 when items array is empty', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: { items: [] },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
