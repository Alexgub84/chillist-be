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

describe('Internal Plan Detail — GET /api/internal/plans/:planId', () => {
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

  async function getPlan(planId: string, headers: Record<string, string> = {}) {
    return app.inject({
      method: 'GET',
      url: `/api/internal/plans/${planId}`,
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        ...headers,
      },
    })
  }

  describe('Auth', () => {
    it('returns 401 when x-service-key is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await app.inject({
        method: 'GET',
        url: `/api/internal/plans/${fakeId}`,
        headers: { 'x-user-id': USER_ID },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await getPlan(fakeId)

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Access', () => {
    it('returns 404 when plan does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099'
      const response = await getPlan(fakeId, { 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Plan not found' })
    })

    it('returns 403 when user is not a participant', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Solo Plan',
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

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'User is not a participant on this plan',
      })
    })
  })

  describe('Happy path', () => {
    it('returns plan with participants and items', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Camping Trip',
          status: 'active',
          visibility: 'invite_only',
          startDate: new Date('2026-04-15T00:00:00.000Z'),
        })
        .returning()

      const [p1] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          displayName: null,
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Dana',
        lastName: 'Smith',
        contactPhone: '+972502000000',
        role: 'participant',
      })

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          category: 'group_equipment',
          assignmentStatusList: [
            { participantId: p1.participantId, status: 'packed' },
          ],
        },
        {
          planId: plan.planId,
          name: 'Charcoal',
          category: 'food',
          assignmentStatusList: [],
        },
      ])

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.plan).toMatchObject({
        id: plan.planId,
        name: 'Camping Trip',
        date: '2026-04-15T00:00:00.000Z',
        role: 'owner',
      })
      expect(body.plan.participants).toHaveLength(2)
      expect(body.plan.participants[0]).toMatchObject({
        name: 'Alex Cohen',
        role: 'owner',
      })
      expect(body.plan.participants[1]).toMatchObject({
        name: 'Dana Smith',
        role: 'participant',
      })

      const tent = body.plan.items.find(
        (i: { name: string }) => i.name === 'Tent'
      )
      const charcoal = body.plan.items.find(
        (i: { name: string }) => i.name === 'Charcoal'
      )
      expect(tent).toMatchObject({
        status: 'done',
        assignee: 'Alex Cohen',
        category: 'gear',
      })
      expect(charcoal).toMatchObject({
        status: 'pending',
        assignee: null,
        category: 'food',
      })
    })

    it('uses displayName for participant name when set', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Display Test',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        displayName: 'AC Display',
        contactPhone: '+972501234567',
        userId: USER_ID,
        role: 'owner',
      })

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })

      expect(response.json().plan.participants[0].name).toBe('AC Display')
    })

    it('maps personal_equipment to gear', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Gear Test',
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

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Boots',
        category: 'personal_equipment',
        assignmentStatusList: [
          { participantId: p.participantId, status: 'pending' },
        ],
      })

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })
      expect(response.json().plan.items[0].category).toBe('gear')
    })

    it('returns assignee null when isAllParticipants is true', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'All Flag',
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

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Shared',
        category: 'group_equipment',
        isAllParticipants: true,
        assignmentStatusList: [
          { participantId: p.participantId, status: 'pending' },
        ],
      })

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })
      expect(response.json().plan.items[0].assignee).toBeNull()
    })

    it('joins multiple assignee names', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Multi assignee',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [p1] = await db
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

      const [p2] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Dana',
          lastName: 'Smith',
          contactPhone: '+972502000000',
          role: 'participant',
        })
        .returning()

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Shared task',
        category: 'food',
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: p1.participantId, status: 'pending' },
          { participantId: p2.participantId, status: 'pending' },
        ],
      })

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })
      const assignee = response.json().plan.items[0].assignee as string
      expect(assignee).toContain('Alex Cohen')
      expect(assignee).toContain('Dana Smith')
      expect(assignee).toMatch(/, /)
    })

    it('returns pending item status when user has no assignment entry', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'No entry',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const insertedParticipants = await db
        .insert(participants)
        .values([
          {
            planId: plan.planId,
            name: 'Alex',
            lastName: 'Cohen',
            contactPhone: '+972501234567',
            userId: USER_ID,
            role: 'participant',
          },
          {
            planId: plan.planId,
            name: 'Other',
            lastName: 'User',
            contactPhone: '+972509999999',
            userId: OTHER_USER_ID,
            role: 'owner',
          },
        ])
        .returning()

      const ownerParticipant = insertedParticipants.find(
        (p) => p.userId === OTHER_USER_ID
      )!

      await db.insert(items).values({
        planId: plan.planId,
        name: 'Only other assigned',
        category: 'group_equipment',
        assignmentStatusList: [
          { participantId: ownerParticipant.participantId, status: 'packed' },
        ],
      })

      const response = await getPlan(plan.planId, { 'x-user-id': USER_ID })
      expect(response.json().plan.items[0].status).toBe('pending')
    })
  })
})
