import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  getTestDb,
  seedTestPlans,
  seedTestParticipants,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { FakeGreenApiClient } from '../../src/services/whatsapp/fake.service.js'
import { phoneToChatId } from '../../src/services/whatsapp/green-api.service.js'
import { participants, plans, items } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const REQUESTER_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'

describe('WhatsApp Integration', () => {
  let app: FastifyInstance
  let fakeGreenApi: FakeGreenApiClient
  let ownerToken: string
  let requesterToken: string
  let db: Awaited<ReturnType<typeof getTestDb>>

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()
    ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
    requesterToken = await signTestJwt({ sub: REQUESTER_USER_ID })
    fakeGreenApi = new FakeGreenApiClient()
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        whatsapp: { greenApiClient: fakeGreenApi },
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
    fakeGreenApi.clear()
  })

  describe('Participant invitation notification', () => {
    it('sends WhatsApp message when participant is created with a phone', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'Invited',
          lastName: 'Person',
          contactPhone: '+972501234567',
        },
      })

      expect(response.statusCode).toBe(201)

      // Fire-and-forget — give it a tick to resolve
      await new Promise((r) => setTimeout(r, 50))

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].chatId).toBe(phoneToChatId('+972501234567'))
      expect(messages[0].message).toContain('invited')
      expect(messages[0].message).toContain('/invite/')
    })

    it('includes plan title in the invitation message', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })
      await db
        .update(plans)
        .set({ title: 'Beach BBQ' })
        .where(eq(plans.planId, plan.planId))

      await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'Guest',
          lastName: 'One',
          contactPhone: '+972509876543',
        },
      })

      await new Promise((r) => setTimeout(r, 50))

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('Beach BBQ')
    })
  })

  describe('Join request notification', () => {
    async function createPlanWithOwner() {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
        visibility: 'invite_only',
      })

      const [owner] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Owner',
          lastName: 'Person',
          contactPhone: '+972501111111',
          role: 'owner',
          userId: OWNER_USER_ID,
          inviteToken: randomBytes(32).toString('hex'),
        })
        .returning()

      await db
        .update(plans)
        .set({ ownerParticipantId: owner.participantId })
        .where(eq(plans.planId, plan.planId))

      return { plan, owner }
    }

    it('sends WhatsApp message to plan owner when join request is created', async () => {
      const { plan } = await createPlanWithOwner()

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'Smith',
          contactPhone: '+972502222222',
        },
      })

      expect(response.statusCode).toBe(201)

      await new Promise((r) => setTimeout(r, 100))

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].chatId).toBe(phoneToChatId('+972501111111'))
      expect(messages[0].message).toContain('Requester Smith')
      expect(messages[0].message).toContain('join')
    })
  })

  describe('Send-list endpoint', () => {
    it('sends formatted item list via WhatsApp', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: OWNER_USER_ID,
      })

      await db
        .update(plans)
        .set({ title: 'Camping Trip' })
        .where(eq(plans.planId, plan.planId))

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          quantity: 1,
          unit: 'pcs',
          category: 'equipment' as const,
        },
        {
          planId: plan.planId,
          name: 'Burgers',
          quantity: 10,
          unit: 'pcs',
          category: 'food' as const,
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          phone: '+972503333333',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.sent).toBe(true)
      expect(body.messageId).toBeDefined()

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].chatId).toBe(phoneToChatId('+972503333333'))
      expect(messages[0].message).toContain('Camping Trip')
      expect(messages[0].message).toContain('Tent')
      expect(messages[0].message).toContain('Burgers')
    })

    it('returns 403 when user is not a participant', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
        visibility: 'invite_only',
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          phone: '+972503333333',
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without auth', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        payload: {
          phone: '+972503333333',
        },
      })

      expect(response.statusCode).toBe(401)
    })

    it('rejects invalid phone number format', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          phone: '555-123-4567',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('sends empty list message when plan has no items', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          phone: '+972504444444',
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().sent).toBe(true)

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('No items yet')
    })
  })

  describe('E.164 phone validation', () => {
    it('rejects participant creation with non-E.164 phone', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'Bad',
          lastName: 'Phone',
          contactPhone: '555-123-4567',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects join request with non-E.164 phone', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Bad',
          lastName: 'Phone',
          contactPhone: '1-555-123-4567',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('accepts valid E.164 phone for participant creation', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'Good',
          lastName: 'Phone',
          contactPhone: '+15551234567',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().contactPhone).toBe('+15551234567')
    })

    it('rejects plan creation with non-E.164 owner phone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Owner',
            lastName: 'Person',
            contactPhone: '050-123-4567',
          },
        },
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
