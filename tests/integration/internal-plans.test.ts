import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  setupTestDatabase,
} from '../helpers/db.js'
import { setupTestKeys, getTestJWKS, getTestIssuer } from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { plans, participants, items } from '../../src/db/schema.js'

const VALID_SERVICE_KEY = 'test-service-key-plans-abc123'
const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-2222-3333-4444-555555555555'

describe('Internal Plans — GET /api/internal/plans', () => {
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

  async function makeRequest(headers: Record<string, string> = {}) {
    return app.inject({
      method: 'GET',
      url: '/api/internal/plans',
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        ...headers,
      },
    })
  }

  describe('Auth', () => {
    it('returns 401 when x-service-key is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/plans',
        headers: { 'x-user-id': USER_ID },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const response = await makeRequest()

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Empty state', () => {
    it('returns empty plans array when user has no plans', async () => {
      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ plans: [] })
    })
  })

  describe('Plan summary fields', () => {
    it('returns correct summary for a single plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Camping Trip',
          status: 'active',
          visibility: 'invite_only',
          startDate: new Date('2026-04-15T00:00:00.000Z'),
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
        inviteStatus: 'accepted',
      })

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.plans).toHaveLength(1)
      expect(body.plans[0]).toMatchObject({
        id: plan.planId,
        name: 'Camping Trip',
        date: '2026-04-15T00:00:00.000Z',
        role: 'owner',
        participantCount: 1,
        itemCount: 0,
        completedItemCount: 0,
      })
    })

    it('returns null date when startDate is not set', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'No Date Plan',
          status: 'draft',
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

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(200)
      expect(response.json().plans[0].date).toBeNull()
    })

    it('returns correct role when user is participant (not owner)', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Group Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values([
        {
          planId: plan.planId,
          name: 'Owner',
          lastName: 'Person',
          contactPhone: '+972500000001',
          userId: OTHER_USER_ID,
          role: 'owner',
        },
        {
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'participant',
        },
      ])

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(200)
      expect(response.json().plans[0].role).toBe('participant')
    })
  })

  describe('Counts', () => {
    it('counts all participants on the plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Multi-person Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values([
        {
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        },
        {
          planId: plan.planId,
          name: 'Dana',
          lastName: 'Smith',
          contactPhone: '+972502000000',
          role: 'participant',
        },
        {
          planId: plan.planId,
          name: 'Ron',
          lastName: 'Levi',
          contactPhone: '+972503000000',
          role: 'participant',
        },
      ])

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.json().plans[0].participantCount).toBe(3)
    })

    it('counts total items on the plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Plan With Items',
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

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          category: 'equipment',
          assignmentStatusList: [],
        },
        {
          planId: plan.planId,
          name: 'Charcoal',
          category: 'food',
          assignmentStatusList: [],
        },
      ])

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.json().plans[0].itemCount).toBe(2)
    })

    it('counts completedItemCount only for items where all assignments are packed or purchased', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Plan With Mixed Items',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [participant] = await db
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

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent (all packed)',
          category: 'equipment',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'packed' },
          ],
        },
        {
          planId: plan.planId,
          name: 'Food (all purchased)',
          category: 'food',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'purchased' },
          ],
        },
        {
          planId: plan.planId,
          name: 'Sleeping bag (pending)',
          category: 'equipment',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'pending' },
          ],
        },
        {
          planId: plan.planId,
          name: 'Firewood (unassigned)',
          category: 'equipment',
          assignmentStatusList: [],
        },
        {
          planId: plan.planId,
          name: 'Mixed status item',
          category: 'equipment',
          assignmentStatusList: [
            { participantId: participant.participantId, status: 'packed' },
            { participantId: OTHER_USER_ID, status: 'pending' },
          ],
        },
      ])

      const response = await makeRequest({ 'x-user-id': USER_ID })

      const summary = response.json().plans[0]
      expect(summary.itemCount).toBe(5)
      expect(summary.completedItemCount).toBe(2)
    })
  })

  describe('Multiple plans', () => {
    it('returns all plans the user is a member of, ordered by creation date', async () => {
      const [plan1] = await db
        .insert(plans)
        .values({
          title: 'First Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [plan2] = await db
        .insert(plans)
        .values({
          title: 'Second Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values([
        {
          planId: plan1.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        },
        {
          planId: plan2.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'participant',
        },
      ])

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(200)
      const { plans: planList } = response.json()
      expect(planList).toHaveLength(2)
      expect(planList[0].name).toBe('First Plan')
      expect(planList[1].name).toBe('Second Plan')
    })

    it('does not return plans the user is not a member of', async () => {
      const [myPlan] = await db
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

      await db.insert(participants).values([
        {
          planId: myPlan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        },
        {
          planId: otherPlan.planId,
          name: 'Dana',
          lastName: 'Smith',
          contactPhone: '+972502000000',
          userId: OTHER_USER_ID,
          role: 'owner',
        },
      ])

      const response = await makeRequest({ 'x-user-id': USER_ID })

      expect(response.json().plans).toHaveLength(1)
      expect(response.json().plans[0].name).toBe('My Plan')
    })
  })
})
