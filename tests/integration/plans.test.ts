import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestPlans,
  seedTestItems,
  seedTestParticipants,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'

function signAdminJwt() {
  return signTestJwt({
    sub: ADMIN_USER_ID,
    app_metadata: { role: 'admin' },
  })
}

const validOwner = {
  name: 'Alex',
  lastName: 'Guberman',
  contactPhone: '+1-555-123-4567',
}

describe('Plans Route', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
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

  describe('POST /plans (deprecated)', () => {
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
      expect(plan.createdAt).toBeDefined()
      expect(plan.updatedAt).toBeDefined()
    })

    it('returns 400 when title is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        payload: { description: 'No title' },
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
  })

  describe('POST /plans/with-owner', () => {
    it('creates plan with owner and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Weekend Camping',
          owner: validOwner,
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.title).toBe('Weekend Camping')
      expect(plan.planId).toBeDefined()
      expect(plan.status).toBe('draft')
      expect(plan.visibility).toBe('public')
      expect(plan.ownerParticipantId).toBeDefined()

      expect(plan.participants).toHaveLength(1)
      expect(plan.participants[0].name).toBe('Alex')
      expect(plan.participants[0].lastName).toBe('Guberman')
      expect(plan.participants[0].contactPhone).toBe('+1-555-123-4567')
      expect(plan.participants[0].role).toBe('owner')
      expect(plan.participants[0].participantId).toBe(plan.ownerParticipantId)

      expect(plan.items).toEqual([])
      expect(plan.createdAt).toBeDefined()
      expect(plan.updatedAt).toBeDefined()
    })

    it('creates plan with all optional fields and owner optional fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Beach Trip',
          description: 'A fun beach trip',
          location: {
            locationId: 'loc-1',
            name: 'Malibu Beach',
            country: 'US',
            city: 'Malibu',
          },
          startDate: '2026-03-01T10:00:00.000Z',
          endDate: '2026-03-05T18:00:00.000Z',
          tags: ['beach', 'vacation'],
          owner: {
            ...validOwner,
            displayName: 'Alex G.',
            avatarUrl: 'https://example.com/avatar.png',
            contactEmail: 'alex@example.com',
          },
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.title).toBe('Beach Trip')
      expect(plan.description).toBe('A fun beach trip')
      expect(plan.visibility).toBe('public')
      expect(plan.startDate).toBe('2026-03-01T10:00:00.000Z')
      expect(plan.endDate).toBe('2026-03-05T18:00:00.000Z')
      expect(plan.tags).toEqual(['beach', 'vacation'])

      const ownerParticipant = plan.participants[0]
      expect(ownerParticipant.displayName).toBe('Alex G.')
      expect(ownerParticipant.avatarUrl).toBe('https://example.com/avatar.png')
      expect(ownerParticipant.contactEmail).toBe('alex@example.com')
    })

    it('creates plan with owner and participants', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Group Trip',
          owner: validOwner,
          participants: [
            {
              name: 'John',
              lastName: 'Doe',
              contactPhone: '+1-555-111-1111',
            },
            {
              name: 'Jane',
              lastName: 'Smith',
              contactPhone: '+1-555-222-2222',
              role: 'viewer',
            },
          ],
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.participants).toHaveLength(3)

      const owner = plan.participants.find(
        (p: { role: string }) => p.role === 'owner'
      )
      expect(owner.name).toBe('Alex')
      expect(owner.participantId).toBe(plan.ownerParticipantId)

      const regularParticipants = plan.participants.filter(
        (p: { role: string }) => p.role !== 'owner'
      )
      expect(regularParticipants).toHaveLength(2)

      const john = regularParticipants.find(
        (p: { name: string }) => p.name === 'John'
      )
      expect(john.role).toBe('participant')

      const jane = regularParticipants.find(
        (p: { name: string }) => p.name === 'Jane'
      )
      expect(jane.role).toBe('viewer')
    })

    it('creates plan with empty participants array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Solo Plan',
          owner: validOwner,
          participants: [],
        },
      })

      expect(response.statusCode).toBe(201)

      const plan = response.json()
      expect(plan.participants).toHaveLength(1)
      expect(plan.participants[0].role).toBe('owner')
    })

    it('created participants are retrievable via GET', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Retrievable Participants Plan',
          owner: validOwner,
          participants: [
            {
              name: 'Sarah',
              lastName: 'Connor',
              contactPhone: '+1-555-333-3333',
            },
          ],
        },
      })

      const createdPlan = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}`,
      })

      const plan = getResponse.json()
      expect(plan.participants).toHaveLength(2)

      const roles = plan.participants.map((p: { role: string }) => p.role)
      expect(roles).toContain('owner')
      expect(roles).toContain('participant')
    })

    it('returns 400 when participant in array has role owner', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: {
          title: 'Bad Role Plan',
          owner: validOwner,
          participants: [
            {
              name: 'Sneaky',
              lastName: 'Person',
              contactPhone: '+1-555-999-9999',
              role: 'owner',
            },
          ],
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when title is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { owner: validOwner },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when owner is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'No Owner Plan' },
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([
      [
        'owner.name',
        { title: 'Test', owner: { lastName: 'Smith', contactPhone: '+1' } },
      ],
      [
        'owner.lastName',
        { title: 'Test', owner: { name: 'Alex', contactPhone: '+1' } },
      ],
      [
        'owner.contactPhone',
        { title: 'Test', owner: { name: 'Alex', lastName: 'Smith' } },
      ],
    ])('returns 400 when %s is missing', async (_field, payload) => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when title is empty string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: '', owner: validOwner },
      })

      expect(response.statusCode).toBe(400)
    })

    it('created plan is retrievable via GET with participants', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'Retrievable Plan', owner: validOwner },
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
      expect(fetchedPlan.participants).toHaveLength(1)
      expect(fetchedPlan.participants[0].role).toBe('owner')
    })

    it('owner appears in participants list endpoint', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'Owner List Test', owner: validOwner },
      })

      const createdPlan = createResponse.json()

      const participantsResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}/participants`,
      })

      expect(participantsResponse.statusCode).toBe(200)
      const participants = participantsResponse.json()
      expect(participants).toHaveLength(1)
      expect(participants[0].role).toBe('owner')
      expect(participants[0].name).toBe('Alex')
      expect(participants[0].participantId).toBe(createdPlan.ownerParticipantId)
    })

    it('additional participants can be added after plan creation', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'Multi Participant Plan', owner: validOwner },
      })

      const createdPlan = createResponse.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${createdPlan.planId}/participants`,
        payload: {
          name: 'Sarah',
          lastName: 'Johnson',
          contactPhone: '+1-555-234-5678',
        },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}`,
      })

      const plan = getResponse.json()
      expect(plan.participants).toHaveLength(2)

      const roles = plan.participants.map((p: { role: string }) => p.role)
      expect(roles).toContain('owner')
      expect(roles).toContain('participant')
    })

    it('owner cannot be deleted from participants', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans/with-owner',
        payload: { title: 'Owner Delete Test', owner: validOwner },
      })

      const createdPlan = createResponse.json()
      const ownerId = createdPlan.ownerParticipantId

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/participants/${ownerId}`,
      })

      expect(deleteResponse.statusCode).toBe(400)
      expect(deleteResponse.json()).toEqual({
        message: 'Cannot delete participant with owner role',
      })
    })
  })

  describe('GET /plans/:planId', () => {
    it('returns plan with participants and items', async () => {
      const [seededPlan] = await seedTestPlans(1)
      await seedTestParticipants(seededPlan.planId, 2)
      await seedTestItems(seededPlan.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      expect(response.statusCode).toBe(200)

      const plan = response.json()
      expect(plan.planId).toBe(seededPlan.planId)
      expect(plan.participants).toHaveLength(2)
      expect(plan.items).toHaveLength(3)
    })

    it('returns plan with empty participants and items when none exist', async () => {
      const [seededPlan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      expect(response.statusCode).toBe(200)

      const plan = response.json()
      expect(plan.planId).toBe(seededPlan.planId)
      expect(plan.title).toBe('Test Plan 1')
      expect(plan.items).toEqual([])
      expect(plan.participants).toEqual([])
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

    it('returns plan with correct structure including items and participants', async () => {
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
      expect(plan).toHaveProperty('participants')
      expect(Array.isArray(plan.items)).toBe(true)
      expect(Array.isArray(plan.participants)).toBe(true)
    })

    it('returns participants with correct structure', async () => {
      const [seededPlan] = await seedTestPlans(1)
      await seedTestParticipants(seededPlan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
      })

      const plan = response.json()
      const [participant] = plan.participants

      expect(participant).toHaveProperty('participantId')
      expect(participant).toHaveProperty('planId')
      expect(participant).toHaveProperty('name')
      expect(participant).toHaveProperty('lastName')
      expect(participant).toHaveProperty('contactPhone')
      expect(participant).toHaveProperty('role')
      expect(participant).toHaveProperty('createdAt')
      expect(participant).toHaveProperty('updatedAt')

      expect(participant.planId).toBe(seededPlan.planId)
      expect(participant.name).toBe('First1')
      expect(participant.lastName).toBe('Last1')
      expect(participant.contactPhone).toBe('+1-555-000-0001')
      expect(participant.role).toBe('owner')
    })

    it('returns only participants belonging to the requested plan', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestParticipants(plan1.planId, 2)
      await seedTestParticipants(plan2.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan1.planId}`,
      })

      const plan = response.json()
      expect(plan.participants).toHaveLength(2)

      for (const participant of plan.participants) {
        expect(participant.planId).toBe(plan1.planId)
      }
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

  describe('PATCH /plans/:planId', () => {
    it('updates title and returns 200 with new updatedAt', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload: { title: 'Updated Title' },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.planId).toBe(plan.planId)
      expect(updated.title).toBe('Updated Title')
      expect(updated.description).toBe(plan.description)
      expect(updated.status).toBe(plan.status)
      expect(updated.visibility).toBe(plan.visibility)
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(plan.updatedAt).getTime()
      )
    })

    it('updates multiple fields at once', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload: {
          title: 'New Title',
          description: 'New description',
          status: 'archived',
          tags: ['camping', 'outdoors'],
        },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.title).toBe('New Title')
      expect(updated.description).toBe('New description')
      expect(updated.status).toBe('archived')
      expect(updated.tags).toEqual(['camping', 'outdoors'])
    })

    it('updates date fields', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload: {
          startDate: '2026-06-01T10:00:00.000Z',
          endDate: '2026-06-05T18:00:00.000Z',
        },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.startDate).toBe('2026-06-01T10:00:00.000Z')
      expect(updated.endDate).toBe('2026-06-05T18:00:00.000Z')
    })

    it.each([
      ['description', { description: null }],
      ['startDate', { startDate: null }],
      ['endDate', { endDate: null }],
      ['tags', { tags: null }],
    ])(
      'clears nullable field %s by setting to null',
      async (_field, payload) => {
        const [plan] = await seedTestPlans(1)

        const response = await app.inject({
          method: 'PATCH',
          url: `/plans/${plan.planId}`,
          payload,
        })

        expect(response.statusCode).toBe(200)
        const updated = response.json()
        expect(updated[_field]).toBeNull()
      }
    )

    it('returns 400 when body is empty', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        message: 'No fields to update',
      })
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${nonExistentId}`,
        payload: { title: 'Ghost Plan' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/plans/invalid-uuid',
        payload: { title: 'Test' },
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([
      ['status', { status: 'completed' }],
      ['visibility', { visibility: 'secret' }],
    ])('returns 400 for invalid %s value', async (_field, payload) => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when title is empty string', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload: { title: '' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('persists update when fetched via GET', async () => {
      const [plan] = await seedTestPlans(1)

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        payload: { title: 'Persisted Title', status: 'archived' },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(getResponse.statusCode).toBe(200)
      const fetched = getResponse.json()
      expect(fetched.title).toBe('Persisted Title')
      expect(fetched.status).toBe('archived')
    })

    it('does not affect other plans', async () => {
      const [plan1, plan2] = await seedTestPlans(2)

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan1.planId}`,
        payload: { title: 'Changed' },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan2.planId}`,
      })

      expect(getResponse.statusCode).toBe(200)
      expect(getResponse.json().title).toBe('Test Plan 2')
    })
  })

  describe('DELETE /plans/:planId', () => {
    it('deletes plan and returns 200 with ok true', async () => {
      const [plan] = await seedTestPlans(1)
      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('deleted plan is no longer retrievable via GET', async () => {
      const [plan] = await seedTestPlans(1)
      const token = await signAdminJwt()

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(getResponse.statusCode).toBe(404)
    })

    it('deleted plan is removed from list', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const token = await signAdminJwt()

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan1.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const listResponse = await app.inject({
        method: 'GET',
        url: '/plans',
      })

      const plans = listResponse.json()
      expect(plans).toHaveLength(1)
      expect(plans[0].planId).toBe(plan2.planId)
    })

    it('cascade deletes related items and participants', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestItems(plan.planId, 3)
      await seedTestParticipants(plan.planId, 2)
      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(getResponse.statusCode).toBe(404)
    })

    it('returns 401 when no JWT is provided', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 404 when plan does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'
      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${nonExistentId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns 400 for invalid UUID format', async () => {
      const token = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: '/plans/invalid-uuid',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it('does not affect other plans', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestItems(plan1.planId, 2)
      await seedTestItems(plan2.planId, 3)
      const token = await signAdminJwt()

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan1.planId}`,
        headers: { authorization: `Bearer ${token}` },
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
