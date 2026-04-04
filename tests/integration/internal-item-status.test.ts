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
import { plans, participants, items } from '../../src/db/schema.js'

const VALID_SERVICE_KEY = 'test-service-key-plans-abc123'
const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'bbbbbbbb-2222-3333-4444-555555555555'

describe('Internal Item Status — PATCH /api/internal/items/:itemId/status', () => {
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

  async function patchStatus(
    itemId: string,
    body: { status: string },
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/internal/items/${itemId}/status`,
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
        method: 'PATCH',
        url: `/api/internal/items/${fakeId}/status`,
        headers: {
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { status: 'done' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await patchStatus(fakeId, { status: 'done' })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Errors', () => {
    it('returns 404 when item does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000088'
      const response = await patchStatus(
        fakeId,
        { status: 'done' },
        {
          'x-user-id': USER_ID,
        }
      )

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Item not found' })
    })

    it('returns 403 when user is not a participant on the plan', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'Other plan',
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

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Thing',
          category: 'food',
          assignmentStatusList: [],
        })
        .returning()

      const response = await patchStatus(
        item.itemId,
        { status: 'done' },
        {
          'x-user-id': USER_ID,
        }
      )

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'User is not a participant on this plan',
      })
    })

    it('returns 400 when body is invalid', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'P',
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

      const [item] = await db
        .insert(items)
        .values({
          planId: plan.planId,
          name: 'Thing',
          category: 'food',
          assignmentStatusList: [],
        })
        .returning()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/items/${item.itemId}/status`,
        headers: {
          'x-service-key': VALID_SERVICE_KEY,
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { status: 'invalid' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('Upsert', () => {
    it('creates assignment entry when none existed', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'P',
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
          assignmentStatusList: [],
        })
        .returning()

      const response = await patchStatus(
        item.itemId,
        { status: 'done' },
        {
          'x-user-id': USER_ID,
        }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        item: { id: item.itemId, name: 'Tent', status: 'done' },
      })

      const [row] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(row!.assignmentStatusList).toEqual([
        { participantId: p.participantId, status: 'purchased' },
      ])
    })

    it('updates existing entry', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'P',
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

      const response = await patchStatus(
        item.itemId,
        { status: 'done' },
        {
          'x-user-id': USER_ID,
        }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().item.status).toBe('done')

      const [row] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(row!.assignmentStatusList[0].status).toBe('purchased')
    })

    it('maps pending to pending in DB', async () => {
      const [plan] = await db
        .insert(plans)
        .values({
          title: 'P',
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
            { participantId: p.participantId, status: 'purchased' },
          ],
        })
        .returning()

      const response = await patchStatus(
        item.itemId,
        { status: 'pending' },
        {
          'x-user-id': USER_ID,
        }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().item.status).toBe('pending')

      const [row] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))

      expect(row!.assignmentStatusList[0].status).toBe('pending')
    })
  })
})
