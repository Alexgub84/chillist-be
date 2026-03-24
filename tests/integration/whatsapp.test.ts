import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  getTestDb,
  seedTestPlans,
  seedTestParticipants,
  seedTestItemWithAssignment,
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

    it('sends WhatsApp rejection message to requester when join request is rejected', async () => {
      const { plan } = await createPlanWithOwner()

      const createRes = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'Jones',
          contactPhone: '+972502222222',
        },
      })
      expect(createRes.statusCode).toBe(201)
      const { requestId } = createRes.json()

      await new Promise((r) => setTimeout(r, 100))
      fakeGreenApi.clear()

      const rejectRes = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'rejected' },
      })
      expect(rejectRes.statusCode).toBe(200)

      await new Promise((r) => setTimeout(r, 100))

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].chatId).toBe(phoneToChatId('+972502222222'))
      expect(messages[0].message).toContain('not approved')
    })
  })

  describe('Send-list endpoint', () => {
    async function createPlanWithParticipants() {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: OWNER_USER_ID,
      })
      const allParticipants = await seedTestParticipants(plan.planId, 3, {
        ownerUserId: OWNER_USER_ID,
      })
      const owner = allParticipants[0]
      await db
        .update(plans)
        .set({
          title: 'Camping Trip',
          ownerParticipantId: owner.participantId,
        })
        .where(eq(plans.planId, plan.planId))

      return { plan, owner, participants: allParticipants }
    }

    it('recipient: "self" sends to caller\'s own phone', async () => {
      const { plan } = await createPlanWithParticipants()

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          quantity: 1,
          unit: 'pcs' as const,
          category: 'group_equipment' as const,
        },
        {
          planId: plan.planId,
          name: 'Burgers',
          quantity: 10,
          unit: 'pcs' as const,
          category: 'food' as const,
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'self' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.total).toBe(1)
      expect(body.sent).toBe(1)
      expect(body.results).toHaveLength(1)
      expect(body.results[0].sent).toBe(true)

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('Camping Trip')
      expect(messages[0].message).toContain('Tent')
      expect(messages[0].message).toContain('Burgers')
    })

    it('recipient: "self" with listType: "full" sends all items', async () => {
      const { plan } = await createPlanWithParticipants()

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          quantity: 1,
          unit: 'pcs' as const,
          category: 'group_equipment' as const,
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'self', listType: 'full' },
      })

      expect(response.statusCode).toBe(200)
      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('Tent')
    })

    it('recipient: "self" with listType: "buying" filters to pending items', async () => {
      const { plan, owner } = await createPlanWithParticipants()

      await seedTestItemWithAssignment(
        plan.planId,
        [{ participantId: owner.participantId, status: 'pending' }],
        { name: 'Pending Item', category: 'food' }
      )
      await seedTestItemWithAssignment(
        plan.planId,
        [{ participantId: owner.participantId, status: 'purchased' }],
        { name: 'Purchased Item', category: 'food' }
      )

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'self', listType: 'buying' },
      })

      expect(response.statusCode).toBe(200)
      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('Pending Item')
      expect(messages[0].message).not.toContain('Purchased Item')
    })

    it('recipient: "all" sends to all non-owner participants', async () => {
      const { plan, participants: allP } = await createPlanWithParticipants()

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          quantity: 1,
          unit: 'pcs' as const,
          category: 'group_equipment' as const,
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'all' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.total).toBe(2)
      expect(body.sent).toBe(2)
      expect(body.results).toHaveLength(2)

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(2)
      const chatIds = messages.map((m: { chatId: string }) => m.chatId)
      expect(chatIds).toContain(phoneToChatId(allP[1].contactPhone!))
      expect(chatIds).toContain(phoneToChatId(allP[2].contactPhone!))
    })

    it('recipient: "all" returns 403 for non-owner', async () => {
      const { plan } = await createPlanWithParticipants()

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { recipient: 'all' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('recipient: "<participantId>" sends to specific participant', async () => {
      const { plan, participants: allP } = await createPlanWithParticipants()

      await db.insert(items).values([
        {
          planId: plan.planId,
          name: 'Tent',
          quantity: 1,
          unit: 'pcs' as const,
          category: 'group_equipment' as const,
        },
      ])

      const targetP = allP[1]
      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: targetP.participantId },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.total).toBe(1)
      expect(body.sent).toBe(1)
      expect(body.results[0].participantId).toBe(targetP.participantId)

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].chatId).toBe(phoneToChatId(targetP.contactPhone!))
    })

    it('listType: "unassigned" filters to unassigned items', async () => {
      const { plan, owner } = await createPlanWithParticipants()

      await seedTestItemWithAssignment(plan.planId, [], {
        name: 'Unassigned Item',
        category: 'group_equipment',
        isAllParticipants: false,
      })
      await seedTestItemWithAssignment(
        plan.planId,
        [{ participantId: owner.participantId, status: 'pending' }],
        { name: 'Assigned Item', category: 'group_equipment' }
      )
      await seedTestItemWithAssignment(plan.planId, [], {
        name: 'AllParticipants Item',
        category: 'group_equipment',
        isAllParticipants: true,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'self', listType: 'unassigned' },
      })

      expect(response.statusCode).toBe(200)
      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('Unassigned Item')
      expect(messages[0].message).not.toContain('Assigned Item')
      expect(messages[0].message).not.toContain('AllParticipants Item')
    })

    it('returns 400 EMPTY_LIST when plan has no items', async () => {
      const { plan } = await createPlanWithParticipants()

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'self' },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.code).toBe('EMPTY_LIST')
      expect(body.message).toContain('No items match')
      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(0)
    })

    it('recipient: "all" skips participants with empty filtered lists', async () => {
      const { plan, participants: allP } = await createPlanWithParticipants()

      await seedTestItemWithAssignment(
        plan.planId,
        [{ participantId: allP[1].participantId, status: 'pending' }],
        { name: 'Pending for P1', category: 'food' }
      )

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { recipient: 'all', listType: 'buying' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.total).toBe(2)
      expect(body.sent).toBe(1)
      expect(body.failed).toBe(1)

      const skipped = body.results.find(
        (r: { participantId: string }) =>
          r.participantId === allP[2].participantId
      )
      expect(skipped.sent).toBe(false)
      expect(skipped.error).toBe('empty_list')

      const sent = body.results.find(
        (r: { participantId: string }) =>
          r.participantId === allP[1].participantId
      )
      expect(sent.sent).toBe(true)

      const messages = fakeGreenApi.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].message).toContain('Pending for P1')
    })

    it('returns 401 without auth', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/send-list`,
        payload: { recipient: 'self' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 404 when user is not a participant of invite-only plan', async () => {
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
        payload: { recipient: 'self' },
      })

      expect(response.statusCode).toBe(404)
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
