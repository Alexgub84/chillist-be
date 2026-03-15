import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestJoinRequests,
  seedTestParticipantWithUser,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { plans, participants, userDetails } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

const OWNER_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const REQUESTER_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const OTHER_USER_ID = 'cccccccc-1111-2222-3333-444444444444'
const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'
const FAKE_REQUEST_ID = 'eeeeeeee-1111-2222-3333-444444444444'
const FAKE_PLAN_ID = 'ffffffff-1111-2222-3333-444444444444'

async function createPlanWithOwner(db: Database, ownerUserId: string) {
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Test Plan',
      status: 'active',
      visibility: 'invite_only',
      createdByUserId: ownerUserId,
    })
    .returning()

  const [owner] = await db
    .insert(participants)
    .values({
      planId: plan.planId,
      name: 'Owner',
      lastName: 'User',
      contactPhone: '+15550000001',
      role: 'owner',
      userId: ownerUserId,
      inviteToken: randomBytes(32).toString('hex'),
    })
    .returning()

  return { plan, owner }
}

describe('Join Request Management', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()

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

  describe('PATCH /plans/:planId/join-requests/:requestId — approve', () => {
    it('owner approves pending request — 200, returns participant with correct fields', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        {
          name: 'Jane',
          lastName: 'Doe',
          contactPhone: '+15559990000',
          contactEmail: 'jane@example.com',
          displayName: 'JaneD',
          adultsCount: 2,
          kidsCount: 1,
          foodPreferences: 'vegetarian',
          allergies: 'nuts',
          notes: 'Excited to join!',
        }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.userId).toBe(REQUESTER_USER_ID)
      expect(body.planId).toBe(plan.planId)
      expect(body.name).toBe('Jane')
      expect(body.lastName).toBe('Doe')
      expect(body.contactPhone).toBe('+15559990000')
      expect(body.contactEmail).toBe('jane@example.com')
      expect(body.displayName).toBe('JaneD')
      expect(body.adultsCount).toBe(2)
      expect(body.kidsCount).toBe(1)
      expect(body.foodPreferences).toBe('vegetarian')
      expect(body.allergies).toBe('nuts')
      expect(body.notes).toBe('Excited to join!')
      expect(body.role).toBe('participant')
      expect(body.rsvpStatus).toBe('confirmed')
      expect(body.inviteToken).toBeNull()
      expect(body.inviteStatus).toBe('accepted')
      expect(body.participantId).toBeDefined()
    })

    it('approved participant appears in GET /plans/:planId/participants', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      const listResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/participants`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })

      expect(listResponse.statusCode).toBe(200)
      const list = listResponse.json()
      const requesterParticipant = list.find(
        (p: { userId: string }) => p.userId === REQUESTER_USER_ID
      )
      expect(requesterParticipant).toBeDefined()
      expect(requesterParticipant.role).toBe('participant')
    })

    it('approved user can access full plan via GET /plans/:planId', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      const requesterToken = await signTestJwt({ sub: REQUESTER_USER_ID })
      const planResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(planResponse.statusCode).toBe(200)
      const body = planResponse.json()
      expect(body.planId).toBe(plan.planId)
      expect(body.status).not.toBe('not_participant')
      expect(body.participants).toBeDefined()
    })

    it('pre-fills foodPreferences/allergies from user_details when missing on request', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)

      await db.insert(userDetails).values({
        userId: REQUESTER_USER_ID,
        foodPreferences: 'kosher',
        allergies: 'shellfish',
      })

      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        { foodPreferences: null, allergies: null }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.foodPreferences).toBe('kosher')
      expect(body.allergies).toBe('shellfish')
    })

    it('does not overwrite existing foodPreferences/allergies from join request', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)

      await db.insert(userDetails).values({
        userId: REQUESTER_USER_ID,
        foodPreferences: 'kosher',
        allergies: 'shellfish',
      })

      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        { foodPreferences: 'vegan', allergies: 'peanuts' }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.foodPreferences).toBe('vegan')
      expect(body.allergies).toBe('peanuts')
    })

    it('returns 409 for already-approved request', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('already been approved')
    })

    it('returns 409 for already-rejected request', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        { status: 'rejected' }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('already been rejected')
    })

    it('returns 403 for non-owner participant', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      await seedTestParticipantWithUser(plan.planId, OTHER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without JWT', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for non-existent requestId', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${FAKE_REQUEST_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toContain('Join request not found')
    })

    it('returns 404 for non-existent planId', async () => {
      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${FAKE_PLAN_ID}/join-requests/${FAKE_REQUEST_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().message).toContain('Plan not found')
    })

    it('admin cannot approve join request on plan they do not own', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const adminToken = await signTestJwt({
        sub: ADMIN_USER_ID,
        app_metadata: { role: 'admin' },
      })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'approved' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().message).toBe(
        'Only the plan owner can manage join requests'
      )
    })
  })

  describe('PATCH /plans/:planId/join-requests/:requestId — reject', () => {
    it('owner rejects pending request — 200, returns join request with status rejected', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        { name: 'Bob', lastName: 'Smith' }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('rejected')
      expect(body.requestId).toBe(joinRequest.requestId)
      expect(body.planId).toBe(plan.planId)
      expect(body.name).toBe('Bob')
      expect(body.lastName).toBe('Smith')
    })

    it('rejected user still sees not_participant when accessing plan', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'rejected' },
      })

      const requesterToken = await signTestJwt({ sub: REQUESTER_USER_ID })
      const planResponse = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })

      expect(planResponse.statusCode).toBe(200)
      const body = planResponse.json()
      expect(body.status).toBe('not_participant')
      expect(body.joinRequest).toBeDefined()
      expect(body.joinRequest.status).toBe('rejected')
    })

    it('returns 409 for already-rejected request', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        { status: 'rejected' }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('already been rejected')
    })

    it('returns 409 for already-approved request', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID,
        { status: 'approved' }
      )

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('already been approved')
    })

    it('returns 403 for non-owner participant', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      await seedTestParticipantWithUser(plan.planId, OTHER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const otherToken = await signTestJwt({ sub: OTHER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without JWT', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for non-existent requestId', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)

      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${FAKE_REQUEST_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(404)
    })

    it('admin cannot reject join request on plan they do not own', async () => {
      const { plan } = await createPlanWithOwner(db, OWNER_USER_ID)
      const joinRequest = await seedTestJoinRequests(
        plan.planId,
        REQUESTER_USER_ID
      )

      const adminToken = await signTestJwt({
        sub: ADMIN_USER_ID,
        app_metadata: { role: 'admin' },
      })
      const response = await app.inject({
        method: 'PATCH',
        url: `/plans/${plan.planId}/join-requests/${joinRequest.requestId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'rejected' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().message).toBe(
        'Only the plan owner can manage join requests'
      )
    })
  })

  describe('Join request full lifecycle flow', () => {
    it('user submits join request with profile, owner approves, user becomes participant and can access plan', async () => {
      const ownerToken = await signTestJwt({ sub: OWNER_USER_ID })
      const requesterToken = await signTestJwt({ sub: REQUESTER_USER_ID })

      const createRes = await app.inject({
        method: 'POST',
        url: '/plans',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          title: 'Lifecycle Test Plan',
          owner: {
            name: 'Owner',
            lastName: 'Person',
            contactPhone: '+15550000001',
          },
        },
      })
      expect(createRes.statusCode).toBe(201)
      const { planId } = createRes.json()

      const submitRes = await app.inject({
        method: 'POST',
        url: `/plans/${planId}/join-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: 'Requester',
          lastName: 'Person',
          contactPhone: '+15559990000',
          contactEmail: 'req@example.com',
          displayName: 'ReqP',
          adultsCount: 3,
          kidsCount: 2,
          foodPreferences: 'halal',
          allergies: 'dairy',
          notes: 'Looking forward to it',
        },
      })
      expect(submitRes.statusCode).toBe(201)
      const submitted = submitRes.json()
      expect(submitted.status).toBe('pending')

      const requesterPlanRes = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })
      expect(requesterPlanRes.statusCode).toBe(200)
      const notParticipant = requesterPlanRes.json()
      expect(notParticipant.status).toBe('not_participant')
      expect(notParticipant.joinRequest.status).toBe('pending')
      expect(notParticipant.joinRequest.name).toBe('Requester')

      const ownerPlanRes = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })
      expect(ownerPlanRes.statusCode).toBe(200)
      const ownerPlan = ownerPlanRes.json()
      expect(ownerPlan.joinRequests).toHaveLength(1)
      expect(ownerPlan.joinRequests[0].status).toBe('pending')
      const { requestId } = ownerPlan.joinRequests[0]

      const approveRes = await app.inject({
        method: 'PATCH',
        url: `/plans/${planId}/join-requests/${requestId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'approved' },
      })
      expect(approveRes.statusCode).toBe(200)
      const approved = approveRes.json()
      expect(approved.userId).toBe(REQUESTER_USER_ID)
      expect(approved.name).toBe('Requester')
      expect(approved.lastName).toBe('Person')
      expect(approved.foodPreferences).toBe('halal')
      expect(approved.allergies).toBe('dairy')
      expect(approved.rsvpStatus).toBe('confirmed')
      expect(approved.inviteToken).toBeNull()

      const fullPlanRes = await app.inject({
        method: 'GET',
        url: `/plans/${planId}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      })
      expect(fullPlanRes.statusCode).toBe(200)
      const fullPlan = fullPlanRes.json()
      expect(fullPlan.planId).toBe(planId)
      expect(fullPlan.status).not.toBe('not_participant')
      const reqParticipant = fullPlan.participants.find(
        (p: { userId: string }) => p.userId === REQUESTER_USER_ID
      )
      expect(reqParticipant).toBeDefined()

      const participantsRes = await app.inject({
        method: 'GET',
        url: `/plans/${planId}/participants`,
        headers: { authorization: `Bearer ${ownerToken}` },
      })
      expect(participantsRes.statusCode).toBe(200)
      const participantsList = participantsRes.json()
      const found = participantsList.find(
        (p: { userId: string }) => p.userId === REQUESTER_USER_ID
      )
      expect(found).toBeDefined()
      expect(found.foodPreferences).toBe('halal')
      expect(found.allergies).toBe('dairy')
      expect(found.adultsCount).toBe(3)
      expect(found.kidsCount).toBe(2)
    })
  })
})
