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

const VALID_SERVICE_KEY = 'test-service-key-detail-abc123'
const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-2222-3333-4444-555555555555'
const MISSING_PLAN_ID = '00000000-0000-0000-0000-000000000001'

describe('Internal API — plan detail + item status', () => {
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

  function internalHeaders(userId: string) {
    return {
      'x-service-key': VALID_SERVICE_KEY,
      'x-user-id': userId,
    }
  }

  describe('GET /api/internal/plans/:planId', () => {
    it('returns 401 when x-user-id is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/internal/plans/${MISSING_PLAN_ID}`,
        headers: { 'x-service-key': VALID_SERVICE_KEY },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })

    it('returns 404 when plan does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/internal/plans/${MISSING_PLAN_ID}`,
        headers: internalHeaders(USER_ID),
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Plan not found' })
    })

    it('returns 403 when user is not a participant', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Other Plan',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      await db.insert(participants).values({
        planId: plan.planId,
        name: 'Dana',
        lastName: 'Smith',
        contactPhone: '+972502000000',
        userId: OTHER_USER_ID,
        role: 'owner',
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/internal/plans/${plan.planId}`,
        headers: internalHeaders(USER_ID),
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ message: 'Access denied' })
    })

    it('returns plan with participants and items for member', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Camping',
          status: 'active',
          visibility: 'invite_only',
          startDate: new Date('2026-05-01T00:00:00.000Z'),
        })
        .returning()

      const [owner] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: USER_ID,
          role: 'owner',
          displayName: 'Alex C.',
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
          isAllParticipants: false,
          assignmentStatusList: [
            { participantId: owner.participantId, status: 'packed' },
          ],
        },
        {
          planId: plan.planId,
          name: 'Salad',
          category: 'food',
          assignmentStatusList: [],
        },
      ])

      const response = await app.inject({
        method: 'GET',
        url: `/api/internal/plans/${plan.planId}`,
        headers: internalHeaders(USER_ID),
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.plan).toMatchObject({
        id: plan.planId,
        name: 'Camping',
        date: '2026-05-01T00:00:00.000Z',
        role: 'owner',
      })
      expect(body.plan.participants).toHaveLength(2)
      expect(body.plan.items).toHaveLength(2)

      const tent = body.plan.items.find(
        (i: { name: string }) => i.name === 'Tent'
      )
      const salad = body.plan.items.find(
        (i: { name: string }) => i.name === 'Salad'
      )
      expect(tent).toMatchObject({
        status: 'done',
        category: 'gear',
      })
      expect(salad).toMatchObject({
        status: 'pending',
        assignee: null,
        category: 'food',
      })
    })
  })

  describe('PATCH /api/internal/items/:itemId/status', () => {
    it('returns 404 when item does not exist', async () => {
      const fakeItemId = '00000000-0000-0000-0000-000000000099'
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/items/${fakeItemId}/status`,
        headers: internalHeaders(USER_ID),
        payload: { status: 'done' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Item not found' })
    })

    it('returns 403 when user is not a participant of the plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Solo',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [pOther] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Dana',
          lastName: 'Smith',
          contactPhone: '+972502000000',
          userId: OTHER_USER_ID,
          role: 'owner',
        })
        .returning()

      const [itm] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Chair',
          category: 'group_equipment',
          assignmentStatusList: [
            { participantId: pOther.participantId, status: 'pending' },
          ],
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/items/${itm.itemId}/status`,
        headers: internalHeaders(USER_ID),
        payload: { status: 'done' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ message: 'Access denied' })
    })

    it('sets purchased when status is done and returns done', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [me] = await db
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

      const [itm] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Cooler',
          category: 'group_equipment',
          assignmentStatusList: [],
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/items/${itm.itemId}/status`,
        headers: internalHeaders(USER_ID),
        payload: { status: 'done' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        item: { id: itm.itemId, name: 'Cooler', status: 'done' },
      })

      const row = await db.query.items.findFirst({
        where: (i, { eq }) => eq(i.itemId, itm.itemId),
      })
      expect(row?.assignmentStatusList).toEqual([
        { participantId: me.participantId, status: 'purchased' },
      ])
    })

    it('sets pending when status is pending', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Trip2',
          status: 'active',
          visibility: 'invite_only',
        })
        .returning()

      const [me] = await db
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

      const [itm] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Mat',
          category: 'personal_equipment',
          assignmentStatusList: [
            { participantId: me.participantId, status: 'purchased' },
          ],
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/items/${itm.itemId}/status`,
        headers: internalHeaders(USER_ID),
        payload: { status: 'pending' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        item: { status: 'pending' },
      })

      const row = await db.query.items.findFirst({
        where: (i, { eq }) => eq(i.itemId, itm.itemId),
      })
      expect(row?.assignmentStatusList).toEqual([
        { participantId: me.participantId, status: 'pending' },
      ])
    })
  })
})
