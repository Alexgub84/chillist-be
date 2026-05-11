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
import { plans, participants } from '../../src/db/schema.js'

const VALID_SERVICE_KEY = 'test-service-key-wa-group-abc123'
const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa'
const PARTICIPANT_USER_ID = 'bbbbbbbb-2222-3333-4444-bbbbbbbbbbbb'

describe('Internal WhatsApp Group Linking', () => {
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

  async function linkGroup(
    planId: string,
    groupId: string | null,
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/internal/plans/${planId}/whatsapp-group`,
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        'x-user-id': OWNER_USER_ID,
        ...headers,
      },
      payload: { groupId },
    })
  }

  async function getPlanByGroup(
    groupId: string,
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'GET',
      url: `/api/internal/whatsapp-group/${encodeURIComponent(groupId)}/plan`,
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        ...headers,
      },
    })
  }

  async function seedPlanWithOwner(overrides?: { whatsappGroupId?: string }) {
    const [plan] = await db
      .insert(plans)
      .values({
        title: 'Camping Trip',
        status: 'active',
        visibility: 'invite_only',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        ...(overrides?.whatsappGroupId && {
          whatsappGroupId: overrides.whatsappGroupId,
        }),
      })
      .returning()

    const [owner] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        name: 'Alex',
        lastName: 'Cohen',
        contactPhone: '+972501234567',
        userId: OWNER_USER_ID,
        role: 'owner',
      })
      .returning()

    return { plan, owner }
  }

  describe('PATCH /api/internal/plans/:planId/whatsapp-group', () => {
    describe('Happy path', () => {
      it('owner can link a WhatsApp group to a plan', async () => {
        const { plan } = await seedPlanWithOwner()
        const groupId = '972501234567-12345@g.us'

        const response = await linkGroup(plan.planId, groupId)

        expect(response.statusCode).toBe(200)
        expect(response.json()).toMatchObject({
          planId: plan.planId,
          groupId,
        })
      })

      it('owner can unlink by passing null', async () => {
        const { plan } = await seedPlanWithOwner({
          whatsappGroupId: '972501234567-99999@g.us',
        })

        const response = await linkGroup(plan.planId, null)

        expect(response.statusCode).toBe(200)
        expect(response.json()).toMatchObject({
          planId: plan.planId,
          groupId: null,
        })
      })

      it('owner can overwrite an existing group link', async () => {
        const { plan } = await seedPlanWithOwner({
          whatsappGroupId: 'old-group@g.us',
        })
        const newGroupId = 'new-group@g.us'

        const response = await linkGroup(plan.planId, newGroupId)

        expect(response.statusCode).toBe(200)
        expect(response.json()).toMatchObject({
          planId: plan.planId,
          groupId: newGroupId,
        })
      })
    })

    describe('Auth', () => {
      it('returns 401 when x-service-key is missing', async () => {
        const { plan } = await seedPlanWithOwner()
        const response = await linkGroup(plan.planId, 'group@g.us', {
          'x-service-key': '',
        })
        expect(response.statusCode).toBe(401)
      })

      it('returns 401 when x-user-id is missing', async () => {
        const { plan } = await seedPlanWithOwner()
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/internal/plans/${plan.planId}/whatsapp-group`,
          headers: { 'x-service-key': VALID_SERVICE_KEY },
          payload: { groupId: 'group@g.us' },
        })
        expect(response.statusCode).toBe(401)
      })
    })

    describe('Authorization', () => {
      it('returns 403 when caller is a participant but not owner', async () => {
        const { plan } = await seedPlanWithOwner()
        await db.insert(participants).values({
          planId: plan.planId,
          name: 'Dana',
          lastName: 'Levy',
          contactPhone: '+972509999999',
          userId: PARTICIPANT_USER_ID,
          role: 'participant',
        })

        const response = await linkGroup(plan.planId, 'group@g.us', {
          'x-user-id': PARTICIPANT_USER_ID,
        })

        expect(response.statusCode).toBe(403)
      })

      it('returns 403 when caller is not a participant at all', async () => {
        const { plan } = await seedPlanWithOwner()
        const nonMemberId = 'cccccccc-3333-4444-5555-cccccccccccc'

        const response = await linkGroup(plan.planId, 'group@g.us', {
          'x-user-id': nonMemberId,
        })

        expect(response.statusCode).toBe(403)
      })
    })

    describe('Not found', () => {
      it('returns 404 when plan does not exist', async () => {
        const fakePlanId = '00000000-0000-0000-0000-000000000099'
        const response = await linkGroup(fakePlanId, 'group@g.us')
        expect(response.statusCode).toBe(404)
      })
    })

    describe('Conflict', () => {
      it('returns 409 when groupId is already linked to a different plan', async () => {
        const sharedGroupId = 'shared-group@g.us'
        const { plan: plan1 } = await seedPlanWithOwner({
          whatsappGroupId: sharedGroupId,
        })

        const [plan2] = await db
          .insert(plans)
          .values({
            title: 'Another Plan',
            status: 'active',
            visibility: 'invite_only',
          })
          .returning()

        await db.insert(participants).values({
          planId: plan2.planId,
          name: 'Alex',
          lastName: 'Cohen',
          contactPhone: '+972501234567',
          userId: OWNER_USER_ID,
          role: 'owner',
        })

        // plan1 already has sharedGroupId — trying to link plan2 to the same group
        void plan1
        const response = await linkGroup(plan2.planId, sharedGroupId)

        expect(response.statusCode).toBe(409)
      })
    })
  })

  describe('GET /api/internal/whatsapp-group/:groupId/plan', () => {
    describe('Happy path', () => {
      it('returns plan summary when groupId is linked', async () => {
        const groupId = '972501234567-linked@g.us'
        const { plan } = await seedPlanWithOwner({ whatsappGroupId: groupId })

        const response = await getPlanByGroup(groupId)

        expect(response.statusCode).toBe(200)
        expect(response.json()).toMatchObject({
          plan: {
            id: plan.planId,
            name: 'Camping Trip',
            date: '2026-06-01T00:00:00.000Z',
          },
        })
      })

      it('returns date as null when plan has no startDate', async () => {
        const groupId = 'no-date-group@g.us'
        const [plan] = await db
          .insert(plans)
          .values({
            title: 'No Date Plan',
            status: 'active',
            visibility: 'invite_only',
            whatsappGroupId: groupId,
          })
          .returning()

        void plan
        const response = await getPlanByGroup(groupId)

        expect(response.statusCode).toBe(200)
        expect(response.json().plan.date).toBeNull()
      })
    })

    describe('Not found', () => {
      it('returns 404 when groupId is not linked to any plan', async () => {
        const response = await getPlanByGroup('unknown-group@g.us')
        expect(response.statusCode).toBe(404)
      })
    })

    describe('Auth', () => {
      it('returns 401 when x-service-key is missing', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/internal/whatsapp-group/somegroup/plan`,
        })
        expect(response.statusCode).toBe(401)
      })
    })
  })
})
