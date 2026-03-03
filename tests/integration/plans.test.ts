import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestPlans,
  seedTestItems,
  seedTestParticipants,
  seedTestParticipantWithUser,
  seedTestJoinRequests,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const REQUESTER_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'cccccccc-1111-2222-3333-444444444444'
const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'

let token: string
let requesterToken: string

function authHeaders() {
  return { authorization: `Bearer ${token}` }
}

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
    token = await signTestJwt({ sub: TEST_USER_ID })
    requesterToken = await signTestJwt({ sub: REQUESTER_USER_ID })
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

  describe('JWT enforcement', () => {
    it.each([
      ['GET', '/plans'],
      ['GET', '/plans/pending-requests'],
      ['POST', '/plans'],
      ['PATCH', '/plans/00000000-0000-0000-0000-000000000000'],
      ['DELETE', '/plans/00000000-0000-0000-0000-000000000000'],
    ])('%s %s returns 401 without JWT', async (method, url) => {
      const response = await app.inject({
        method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
        url,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        message: 'Authentication required',
      })
    })

    it('GET /plans/:planId without JWT returns 401', async () => {
      const [plan] = await seedTestPlans(1)
      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ message: 'Authentication required' })
    })
  })

  describe('GET /plans', () => {
    it('returns empty array when no plans exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: authHeaders(),
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns all plans when plans exist', async () => {
      await seedTestPlans(3)

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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

  describe('GET /plans/pending-requests', () => {
    it('returns empty array when user has no pending join requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/pending-requests',
        headers: authHeaders(),
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns plans with pending join requests for the user', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: {
          title: 'Beach Day',
          owner: validOwner,
          location: {
            locationId: 'loc-beach',
            name: 'Tel Aviv Beach',
            city: 'Tel Aviv',
          },
          startDate: '2026-03-10T00:00:00.000Z',
          endDate: '2026-03-11T00:00:00.000Z',
        },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/plans/pending-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(response.statusCode).toBe(200)
      const list = response.json()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({
        planId,
        title: 'Beach Day',
        startDate: '2026-03-10T00:00:00.000Z',
        endDate: '2026-03-11T00:00:00.000Z',
        location: {
          locationId: 'loc-beach',
          name: 'Tel Aviv Beach',
          city: 'Tel Aviv',
        },
      })
    })

    it('excludes approved and rejected join requests', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Approved Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      const ownerToken = await signTestJwt({ sub: TEST_USER_ID })
      const planRes = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })
      const { requestId } = planRes.json().joinRequests[0]

      await app.inject({
        method: 'PATCH',
        url: `/plans/${planId}/join-requests/${requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/plans/pending-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns only minimal fields (planId, title, dates, location)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Minimal Fields Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/plans/pending-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      const [item] = response.json()
      expect(Object.keys(item)).toEqual([
        'planId',
        'title',
        'startDate',
        'endDate',
        'location',
      ])
      expect(item.description).toBeUndefined()
      expect(item.status).toBeUndefined()
      expect(item.participants).toBeUndefined()
    })
  })

  describe('POST /plans', () => {
    it('creates plan with owner and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
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
      expect(plan.visibility).toBe('invite_only')
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
        url: '/plans',
        headers: authHeaders(),
        payload: {
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
      expect(plan.visibility).toBe('private')
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
        url: '/plans',
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
        payload: { owner: validOwner },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when owner is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when title is empty string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: '', owner: validOwner },
      })

      expect(response.statusCode).toBe(400)
    })

    it('created plan is retrievable via GET with participants', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Retrievable Plan', owner: validOwner },
      })

      const createdPlan = createResponse.json()

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}`,
        headers: authHeaders(),
      })

      expect(getResponse.statusCode).toBe(200)

      const fetchedPlan = getResponse.json()
      console.log(
        '[LOG] GET /plans/:planId (owner, no join requests) body:',
        JSON.stringify(fetchedPlan, null, 2)
      )
      expect(fetchedPlan.planId).toBe(createdPlan.planId)
      expect(fetchedPlan.title).toBe('Retrievable Plan')
      expect(fetchedPlan.items).toEqual([])
      expect(fetchedPlan.participants).toHaveLength(1)
      expect(fetchedPlan.participants[0].role).toBe('owner')
      expect(fetchedPlan.joinRequests).toEqual([])
    })

    it('owner sees joinRequests when non-participant has submitted a request', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Plan With Join Request', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: authHeaders(),
      })

      expect(getResponse.statusCode).toBe(200)
      const plan = getResponse.json()
      console.log(
        '[LOG] GET /plans/:planId (owner, with joinRequests) body:',
        JSON.stringify(plan, null, 2)
      )
      expect(plan.joinRequests).toHaveLength(1)
      expect(plan.joinRequests[0].name).toBe('Requester')
      expect(plan.joinRequests[0].status).toBe('pending')
    })

    it('admin does not receive joinRequests when fetching plan', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Plan For Admin Test', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      const adminResponse = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${await signAdminJwt()}` },
      })

      expect(adminResponse.statusCode).toBe(200)
      const plan = adminResponse.json()
      expect(plan.joinRequests).toBeUndefined()
    })

    it('non-owner participant does not receive joinRequests', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Plan With Linked Participant', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      await seedTestParticipantWithUser(planId, REQUESTER_USER_ID)
      await seedTestJoinRequests(planId, OTHER_USER_ID)

      const participantResponse = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(participantResponse.statusCode).toBe(200)
      const plan = participantResponse.json()
      expect(plan.joinRequests).toBeUndefined()
    })

    it('owner appears in participants list endpoint', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Owner List Test', owner: validOwner },
      })

      const createdPlan = createResponse.json()

      const participantsResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}/participants`,
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Multi Participant Plan', owner: validOwner },
      })

      const createdPlan = createResponse.json()

      await app.inject({
        method: 'POST',
        url: `/plans/${createdPlan.planId}/participants`,
        headers: authHeaders(),
        payload: {
          name: 'Sarah',
          lastName: 'Johnson',
          contactPhone: '+1-555-234-5678',
        },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${createdPlan.planId}`,
        headers: authHeaders(),
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
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Owner Delete Test', owner: validOwner },
      })

      const createdPlan = createResponse.json()
      const ownerId = createdPlan.ownerParticipantId

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/participants/${ownerId}`,
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns not_participant with preview when JWT user is not a participant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: {
          title: 'Owner Plan',
          owner: validOwner,
        },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      console.log(
        '[LOG] GET /plans/:planId (non-participant) body:',
        JSON.stringify(body, null, 2)
      )
      expect(body.status).toBe('not_participant')
      expect(body.preview).toBeDefined()
      expect(body.preview.title).toBe('Owner Plan')
      expect(body.preview).toHaveProperty('description')
      expect(body.preview).toHaveProperty('location')
      expect(body.preview).toHaveProperty('startDate')
      expect(body.preview).toHaveProperty('endDate')
      expect(body.joinRequest).toBeNull()
    })
  })

  describe('GET /plans/:planId/preview', () => {
    it('returns 401 without JWT', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/preview`,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ message: 'Authentication required' })
    })

    it('returns preview when authed and not a participant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Preview Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${planId}/preview`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.title).toBe('Preview Plan')
      expect(body).toHaveProperty('description')
      expect(body).toHaveProperty('location')
      expect(body).toHaveProperty('startDate')
      expect(body).toHaveProperty('endDate')
    })

    it('returns 400 when already a participant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Owner Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${planId}/preview`,
        headers: authHeaders(),
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('Already a participant')
    })

    it('returns 404 for nonexistent plan', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/00000000-0000-0000-0000-000000000000/preview',
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ message: 'Plan not found' })
    })
  })

  describe('POST /plans/:planId/join-requests', () => {
    it('creates join request for non-participant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Joinable Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.planId).toBe(planId)
      expect(body.supabaseUserId).toBe(REQUESTER_USER_ID)
      expect(body.name).toBe('Requester')
      expect(body.lastName).toBe('User')
      expect(body.contactPhone).toBe('+1-555-999-9999')
      expect(body.status).toBe('pending')
    })

    it('returns existing join request when one already exists (idempotent)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Idempotent Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const first = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })
      expect(first.statusCode).toBe(201)

      const second = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })
      expect(second.statusCode).toBe(200)
      expect(second.json().requestId).toBe(first.json().requestId)
    })

    it('returns 400 when user is already a participant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: authHeaders(),
        payload: { title: 'Owner Plan', owner: validOwner },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: authHeaders(),
        payload: {
          name: 'Alex',
          lastName: 'Guberman',
          contactPhone: '+1-555-123-4567',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toContain('Already a participant')
    })

    it('returns 404 for nonexistent plan', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans/00000000-0000-0000-0000-000000000000/join-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 401 without JWT', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/join-requests`,
        payload: {
          name: 'Requester',
          lastName: 'User',
          contactPhone: '+1-555-999-9999',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /plans/:planId - validation', () => {
    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/plans/invalid-uuid',
        headers: authHeaders(),
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns plan with correct structure including items and participants', async () => {
      const [seededPlan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${seededPlan.planId}`,
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
        payload: { title: 'Updated Title' },
      })

      expect(response.statusCode).toBe(200)

      const updated = response.json()
      expect(updated.planId).toBe(plan.planId)
      expect(updated.title).toBe('Updated Title')
      expect(updated.description).toBe(plan.description)
      expect(updated.status).toBe(plan.status)
      expect(updated.visibility).toBe(plan.visibility)
      expect(updated.updatedAt).toBeDefined()
      expect(new Date(updated.updatedAt).getTime()).not.toBeNaN()
    })

    it('updates multiple fields at once', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: authHeaders(),
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
        headers: authHeaders(),
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
          headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
        payload,
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when title is empty string', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: authHeaders(),
        payload: { title: '' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('persists update when fetched via GET', async () => {
      const [plan] = await seedTestPlans(1)

      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}`,
        headers: authHeaders(),
        payload: { title: 'Persisted Title', status: 'archived' },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: authHeaders(),
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
        headers: authHeaders(),
        payload: { title: 'Changed' },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan2.planId}`,
        headers: authHeaders(),
      })

      expect(getResponse.statusCode).toBe(200)
      expect(getResponse.json().title).toBe('Test Plan 2')
    })
  })

  describe('DELETE /plans/:planId', () => {
    it('deletes plan and returns 200 with ok true', async () => {
      const [plan] = await seedTestPlans(1)
      const adminToken = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('deleted plan is no longer retrievable via GET', async () => {
      const [plan] = await seedTestPlans(1)
      const adminToken = await signAdminJwt()

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: authHeaders(),
      })

      expect(getResponse.statusCode).toBe(404)
    })

    it('deleted plan is removed from list', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      const adminToken = await signAdminJwt()

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan1.planId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      const listResponse = await app.inject({
        method: 'GET',
        url: '/plans',
        headers: authHeaders(),
      })

      const plans = listResponse.json()
      expect(plans).toHaveLength(1)
      expect(plans[0].planId).toBe(plan2.planId)
    })

    it('cascade deletes related items and participants', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestItems(plan.planId, 3)
      await seedTestParticipants(plan.planId, 2)
      const adminToken = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: authHeaders(),
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
      const adminToken = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: `/plans/${nonExistentId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Plan not found',
      })
    })

    it('returns 400 for invalid UUID format', async () => {
      const adminToken = await signAdminJwt()

      const response = await app.inject({
        method: 'DELETE',
        url: '/plans/invalid-uuid',
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(400)
    })

    it('does not affect other plans', async () => {
      const [plan1, plan2] = await seedTestPlans(2)
      await seedTestItems(plan1.planId, 2)
      await seedTestItems(plan2.planId, 3)
      const adminToken = await signAdminJwt()

      await app.inject({
        method: 'DELETE',
        url: `/plans/${plan1.planId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      const getResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan2.planId}`,
        headers: authHeaders(),
      })

      expect(getResponse.statusCode).toBe(200)

      const plan = getResponse.json()
      expect(plan.planId).toBe(plan2.planId)
      expect(plan.items).toHaveLength(3)
    })
  })
})
