import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
  getTestDb,
} from '../helpers/db.js'
import { participants } from '../../src/db/schema.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('Guest Auth Plugin', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    token = await signTestJwt({ sub: TEST_USER_ID })
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

  describe('X-Invite-Token — valid token', () => {
    it('updates lastActivityAt when a valid invite token is sent', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 2)
      const token = participantList[1].inviteToken!

      const db = await getTestDb()
      const [before] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, participantList[1].participantId))
      expect(before.lastActivityAt).toBeNull()

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
        headers: { 'x-invite-token': token },
      })

      const [after] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, participantList[1].participantId))
      expect(after.lastActivityAt).not.toBeNull()
      expect(after.lastActivityAt).toBeInstanceOf(Date)
    })

    it('only updates lastActivityAt for the matching participant', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 3)
      const token = participantList[1].inviteToken!

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
        headers: { 'x-invite-token': token },
      })

      const db = await getTestDb()
      const allParticipants = await db
        .select({
          participantId: participants.participantId,
          lastActivityAt: participants.lastActivityAt,
        })
        .from(participants)
        .where(eq(participants.planId, plan.planId))

      const touched = allParticipants.find(
        (p) => p.participantId === participantList[1].participantId
      )
      const others = allParticipants.filter(
        (p) => p.participantId !== participantList[1].participantId
      )

      expect(touched!.lastActivityAt).not.toBeNull()
      for (const other of others) {
        expect(other.lastActivityAt).toBeNull()
      }
    })

    it('updates lastActivityAt on subsequent requests with increasing timestamps', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const token = participantList[0].inviteToken!
      const pid = participantList[0].participantId
      const db = await getTestDb()

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
        headers: { 'x-invite-token': token },
      })

      const [first] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, pid))

      await new Promise((resolve) => setTimeout(resolve, 50))

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${token}`,
        headers: { 'x-invite-token': token },
      })

      const [second] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, pid))

      expect(second.lastActivityAt!.getTime()).toBeGreaterThanOrEqual(
        first.lastActivityAt!.getTime()
      )
    })

    it('resolves the correct planId from the token', async () => {
      const plans = await seedTestPlans(2)
      const p1List = await seedTestParticipants(plans[0].planId, 1)
      const p2List = await seedTestParticipants(plans[1].planId, 1)

      await app.inject({
        method: 'GET',
        url: `/plans/${plans[0].planId}/invite/${p1List[0].inviteToken}`,
        headers: { 'x-invite-token': p1List[0].inviteToken! },
      })

      await app.inject({
        method: 'GET',
        url: `/plans/${plans[1].planId}/invite/${p2List[0].inviteToken}`,
        headers: { 'x-invite-token': p2List[0].inviteToken! },
      })

      const db = await getTestDb()
      const [r1] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, p1List[0].participantId))
      const [r2] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, p2List[0].participantId))

      expect(r1.lastActivityAt).not.toBeNull()
      expect(r2.lastActivityAt).not.toBeNull()
    })
  })

  describe('X-Invite-Token — invalid/missing token', () => {
    it('does not update lastActivityAt when no header is sent', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participantList[0].inviteToken}`,
      })

      const db = await getTestDb()
      const [result] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, participantList[0].participantId))
      expect(result.lastActivityAt).toBeNull()
    })

    it('does not update lastActivityAt when token does not exist in DB', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participantList[0].inviteToken}`,
        headers: { 'x-invite-token': 'a'.repeat(64) },
      })

      const db = await getTestDb()
      const [result] = await db
        .select({ lastActivityAt: participants.lastActivityAt })
        .from(participants)
        .where(eq(participants.participantId, participantList[0].participantId))
      expect(result.lastActivityAt).toBeNull()
    })

    it.each([
      ['empty string', ''],
      ['single character', 'x'],
      ['very long string', 'a'.repeat(500)],
      ['string with special chars', '<script>alert("xss")</script>'],
      ['string with SQL injection attempt', "'; DROP TABLE participants; --"],
    ])(
      'does not crash and leaves lastActivityAt null for malformed token: %s',
      async (_label, badToken) => {
        const [plan] = await seedTestPlans(1)
        const participantList = await seedTestParticipants(plan.planId, 1)

        const response = await app.inject({
          method: 'GET',
          url: `/plans/${plan.planId}/invite/${participantList[0].inviteToken}`,
          headers: { 'x-invite-token': badToken },
        })

        expect(response.statusCode).toBeLessThan(500)

        const db = await getTestDb()
        const [result] = await db
          .select({ lastActivityAt: participants.lastActivityAt })
          .from(participants)
          .where(
            eq(participants.participantId, participantList[0].participantId)
          )
        expect(result.lastActivityAt).toBeNull()
      }
    )
  })

  describe('API key bypass for /guest/ and /invite/ routes', () => {
    it('does not return 401 for /invite/ routes without API key', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${participantList[0].inviteToken}`,
        headers: {},
      })

      expect(response.statusCode).not.toBe(401)
    })

    it('returns 404 (not 401) for /guest/ routes without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guest/plan',
        headers: {},
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 (not 401) for /guest/ routes with invalid invite token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guest/plan',
        headers: { 'x-invite-token': 'nonexistent-token' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('rsvpStatus field', () => {
    it('defaults to pending when creating a participant via POST', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Test',
          lastName: 'Guest',
          contactPhone: '+1-555-000-1234',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().rsvpStatus).toBe('pending')
    })

    it('defaults to pending when creating via POST /plans', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Test Plan',
          owner: {
            name: 'Owner',
            lastName: 'Test',
            contactPhone: '+1-555-000-0001',
          },
          participants: [
            {
              name: 'Guest',
              lastName: 'One',
              contactPhone: '+1-555-000-0002',
            },
          ],
        },
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      for (const p of result.participants) {
        expect(p.rsvpStatus).toBe('pending')
      }
    })

    it('is included in participant list response', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 3)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      for (const p of response.json()) {
        expect(p.rsvpStatus).toBe('pending')
      }
    })

    it('is included in single participant GET response', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'GET',
        url: `/participants/${participantList[0].participantId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('pending')
    })

    it('is included in participant PATCH response', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)

      const response = await app.inject({
        method: 'PATCH',
        url: `/participants/${participantList[0].participantId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { displayName: 'Updated Name' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().rsvpStatus).toBe('pending')
    })
  })

  describe('lastActivityAt field', () => {
    it('is null on newly created participants', async () => {
      const [plan] = await seedTestPlans(1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'New',
          lastName: 'Person',
          contactPhone: '+1-555-000-5678',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().lastActivityAt).toBeNull()
    })

    it('is null in participant list for untouched participants', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 2)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      for (const p of response.json()) {
        expect(p.lastActivityAt).toBeNull()
      }
    })

    it('is a valid timestamp after guest accesses via invite token', async () => {
      const [plan] = await seedTestPlans(1)
      const participantList = await seedTestParticipants(plan.planId, 1)
      const inviteToken = participantList[0].inviteToken!

      await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/invite/${inviteToken}`,
        headers: { 'x-invite-token': inviteToken },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/participants/${participantList[0].participantId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const lastActivity = response.json().lastActivityAt
      expect(lastActivity).not.toBeNull()
      expect(new Date(lastActivity).getTime()).not.toBeNaN()
    })
  })
})
