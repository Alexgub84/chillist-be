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

const VALID_SERVICE_KEY = 'test-service-key-assign-abc123'
const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const PARTICIPANT_USER_ID = 'bbbbbbbb-2222-3333-4444-555555555555'
const THIRD_USER_ID = 'cccccccc-3333-4444-5555-666666666666'

describe('Internal Item Assign — PATCH /api/internal/items/:itemId/assign', () => {
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

  async function patchAssign(
    itemId: string,
    body: { participantId: string },
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/internal/items/${itemId}/assign`,
      headers: {
        'x-service-key': VALID_SERVICE_KEY,
        'content-type': 'application/json',
        ...headers,
      },
      payload: body,
    })
  }

  async function seedPlan() {
    const [plan] = await db
      .insert(plans)
      .values({
        title: 'Test Plan',
        status: 'active',
        visibility: 'invite_only',
      })
      .returning()

    const [owner] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        name: 'Owner',
        lastName: 'Test',
        contactPhone: '+972501111111',
        userId: OWNER_USER_ID,
        role: 'owner',
        displayName: 'Owner Test',
      })
      .returning()

    const [participant] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        name: 'Participant',
        lastName: 'Test',
        contactPhone: '+972502222222',
        userId: PARTICIPANT_USER_ID,
        role: 'participant',
        displayName: 'Participant Test',
      })
      .returning()

    const [item] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: 'Tent',
        category: 'group_equipment',
        quantity: 1,
        unit: 'pcs',
        assignmentStatusList: [],
        isAllParticipants: false,
      })
      .returning()

    return { plan, owner, participant, item }
  }

  describe('Auth', () => {
    it('returns 401 when x-service-key is missing', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001'
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/internal/items/${fakeId}/assign`,
        headers: {
          'x-user-id': OWNER_USER_ID,
          'content-type': 'application/json',
        },
        payload: { participantId: fakeId },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const { item, owner } = await seedPlan()
      const response = await patchAssign(item.itemId, {
        participantId: owner.participantId,
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Happy paths', () => {
    it('owner assigns unassigned item to any participant', async () => {
      const { item, participant } = await seedPlan()

      const response = await patchAssign(
        item.itemId,
        { participantId: participant.participantId },
        { 'x-user-id': OWNER_USER_ID }
      )

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.item.id).toBe(item.itemId)
      expect(body.item.name).toBe('Tent')
      expect(body.item.assignedParticipantId).toBe(participant.participantId)

      const [updated] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(updated.assignmentStatusList).toEqual([
        { participantId: participant.participantId, status: 'pending' },
      ])
    })

    it('owner reassigns item already assigned to another participant (replaces previous assignee)', async () => {
      const { item, owner, participant } = await seedPlan()

      // pre-assign to owner
      await db
        .update(items)
        .set({
          assignmentStatusList: [
            { participantId: owner.participantId, status: 'pending' },
          ],
        })
        .where(eq(items.itemId, item.itemId))

      const response = await patchAssign(
        item.itemId,
        { participantId: participant.participantId },
        { 'x-user-id': OWNER_USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().item.assignedParticipantId).toBe(
        participant.participantId
      )

      const [updated] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(updated.assignmentStatusList).toEqual([
        { participantId: participant.participantId, status: 'pending' },
      ])
      expect(updated.assignmentStatusList).not.toContainEqual({
        participantId: owner.participantId,
        status: 'pending',
      })
    })

    it('owner assigns item to themselves', async () => {
      const { item, owner } = await seedPlan()

      const response = await patchAssign(
        item.itemId,
        { participantId: owner.participantId },
        { 'x-user-id': OWNER_USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().item.assignedParticipantId).toBe(
        owner.participantId
      )
    })

    it('participant self-assigns unassigned item', async () => {
      const { item, participant } = await seedPlan()

      const response = await patchAssign(
        item.itemId,
        { participantId: participant.participantId },
        { 'x-user-id': PARTICIPANT_USER_ID }
      )

      expect(response.statusCode).toBe(200)
      expect(response.json().item.assignedParticipantId).toBe(
        participant.participantId
      )

      const [updated] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(updated.assignmentStatusList).toEqual([
        { participantId: participant.participantId, status: 'pending' },
      ])
    })

    it('owner reassign clears isAllParticipants flag', async () => {
      const { item, owner } = await seedPlan()

      await db
        .update(items)
        .set({ isAllParticipants: true })
        .where(eq(items.itemId, item.itemId))

      const response = await patchAssign(
        item.itemId,
        { participantId: owner.participantId },
        { 'x-user-id': OWNER_USER_ID }
      )

      expect(response.statusCode).toBe(200)
      const [updated] = await db
        .select({
          assignmentStatusList: items.assignmentStatusList,
          isAllParticipants: items.isAllParticipants,
        })
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(updated.isAllParticipants).toBe(false)
      expect(updated.assignmentStatusList).toEqual([
        { participantId: owner.participantId, status: 'pending' },
      ])
    })
  })

  describe('Error paths', () => {
    it('returns 404 when item does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099'
      const response = await patchAssign(
        fakeId,
        { participantId: fakeId },
        { 'x-user-id': OWNER_USER_ID }
      )
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ message: 'Item not found' })
    })

    it('returns 403 when caller is not a participant on the plan', async () => {
      const { item, owner } = await seedPlan()
      const response = await patchAssign(
        item.itemId,
        { participantId: owner.participantId },
        { 'x-user-id': THIRD_USER_ID }
      )
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'User is not a participant on this plan',
      })
    })

    it('returns 404 when target participant is not on the plan', async () => {
      const { item } = await seedPlan()
      const fakeParticipantId = '00000000-0000-0000-0000-000000000077'
      const response = await patchAssign(
        item.itemId,
        { participantId: fakeParticipantId },
        { 'x-user-id': OWNER_USER_ID }
      )
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({
        message: 'Target participant not found on this plan',
      })
    })

    it('returns 403 when participant tries to assign to another participant', async () => {
      const { item, owner } = await seedPlan()
      const response = await patchAssign(
        item.itemId,
        { participantId: owner.participantId },
        { 'x-user-id': PARTICIPANT_USER_ID }
      )
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'Participants can only assign items to themselves',
      })
    })

    it('returns 403 when participant tries to assign an already-assigned item', async () => {
      const { item, owner, participant } = await seedPlan()

      await db
        .update(items)
        .set({
          assignmentStatusList: [
            { participantId: owner.participantId, status: 'pending' },
          ],
        })
        .where(eq(items.itemId, item.itemId))

      const response = await patchAssign(
        item.itemId,
        { participantId: participant.participantId },
        { 'x-user-id': PARTICIPANT_USER_ID }
      )
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'Item is already assigned',
      })
    })

    it('returns 403 when participant tries to assign an isAllParticipants item', async () => {
      const { item, participant } = await seedPlan()

      await db
        .update(items)
        .set({ isAllParticipants: true })
        .where(eq(items.itemId, item.itemId))

      const response = await patchAssign(
        item.itemId,
        { participantId: participant.participantId },
        { 'x-user-id': PARTICIPANT_USER_ID }
      )
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'Item is already assigned',
      })
    })

    it('returns 403 when viewer tries to assign', async () => {
      const { plan, item } = await seedPlan()

      const [viewer] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Viewer',
          lastName: 'Test',
          contactPhone: '+972503333333',
          userId: THIRD_USER_ID,
          role: 'viewer',
          displayName: 'Viewer Test',
        })
        .returning()

      const response = await patchAssign(
        item.itemId,
        { participantId: viewer.participantId },
        { 'x-user-id': THIRD_USER_ID }
      )
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        message: 'Viewers cannot assign items',
      })
    })
  })

  describe('No side effects on failure', () => {
    it('failed 403 does not modify assignmentStatusList', async () => {
      const { item, owner, participant } = await seedPlan()

      await db
        .update(items)
        .set({
          assignmentStatusList: [
            { participantId: owner.participantId, status: 'pending' },
          ],
        })
        .where(eq(items.itemId, item.itemId))

      await patchAssign(
        item.itemId,
        { participantId: participant.participantId },
        { 'x-user-id': PARTICIPANT_USER_ID }
      )

      const [unchanged] = await db
        .select({ assignmentStatusList: items.assignmentStatusList })
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(unchanged.assignmentStatusList).toEqual([
        { participantId: owner.participantId, status: 'pending' },
      ])
    })
  })
})
