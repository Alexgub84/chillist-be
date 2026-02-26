import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { Database } from '../../src/db/index.js'
import { eq } from 'drizzle-orm'
import { plans, participants } from '../../src/db/schema.js'
import { randomBytes } from 'node:crypto'

const OWNER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const LINKED_USER_ID = 'bbbbbbbb-1111-2222-3333-444444444444'

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

async function createPlanWithLinkedParticipant(
  db: Database,
  opts: {
    participantName?: string
    participantLastName?: string
    participantEmail?: string
    participantPhone?: string
  } = {}
) {
  const [plan] = await db
    .insert(plans)
    .values({
      title: 'Sync Test Plan',
      status: 'active',
      visibility: 'invite_only',
      createdByUserId: OWNER_ID,
    })
    .returning()

  const [ownerParticipant] = await db
    .insert(participants)
    .values({
      planId: plan.planId,
      name: 'Owner',
      lastName: 'Person',
      contactPhone: '+1-555-000-0000',
      role: 'owner',
      userId: OWNER_ID,
      inviteToken: generateToken(),
    })
    .returning()

  await db
    .update(plans)
    .set({ ownerParticipantId: ownerParticipant.participantId })
    .where(eq(plans.planId, plan.planId))

  const [linkedParticipant] = await db
    .insert(participants)
    .values({
      planId: plan.planId,
      name: opts.participantName ?? 'Old',
      lastName: opts.participantLastName ?? 'Name',
      contactPhone: opts.participantPhone ?? '+1-555-000-0001',
      contactEmail: opts.participantEmail ?? null,
      role: 'participant',
      userId: LINKED_USER_ID,
      inviteToken: generateToken(),
    })
    .returning()

  return { plan, ownerParticipant, linkedParticipant }
}

describe('Profile sync on plan fetch', () => {
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

  it('syncs participant identity when JWT profile differs from stored data', async () => {
    const { plan, linkedParticipant } =
      await createPlanWithLinkedParticipant(db)

    const jwt = await signTestJwt({
      sub: LINKED_USER_ID,
      email: 'newbob@example.com',
      user_metadata: {
        first_name: 'NewBob',
        last_name: 'NewSmith',
        phone: '+1-555-999-0000',
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/plans/${plan.planId}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const synced = body.participants.find(
      (p: { participantId: string }) =>
        p.participantId === linkedParticipant.participantId
    )

    expect(synced.name).toBe('NewBob')
    expect(synced.lastName).toBe('NewSmith')
    expect(synced.contactEmail).toBe('newbob@example.com')
    expect(synced.contactPhone).toBe('+1-555-999-0000')
  })

  it('does not write to DB when participant data matches JWT', async () => {
    const { plan, linkedParticipant } = await createPlanWithLinkedParticipant(
      db,
      {
        participantName: 'Bob',
        participantLastName: 'Smith',
        participantEmail: 'bob@example.com',
        participantPhone: '+1-555-000-0001',
      }
    )

    const jwt = await signTestJwt({
      sub: LINKED_USER_ID,
      email: 'bob@example.com',
      user_metadata: {
        first_name: 'Bob',
        last_name: 'Smith',
      },
    })

    const beforeFetch = linkedParticipant.updatedAt

    const response = await app.inject({
      method: 'GET',
      url: `/plans/${plan.planId}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)

    const [dbRecord] = await db
      .select({ updatedAt: participants.updatedAt })
      .from(participants)
      .where(eq(participants.participantId, linkedParticipant.participantId))

    expect(dbRecord.updatedAt.getTime()).toBe(beforeFetch.getTime())
  })

  it('syncs identity from Google OAuth full_name on plan fetch', async () => {
    const { plan, linkedParticipant } =
      await createPlanWithLinkedParticipant(db)

    const jwt = await signTestJwt({
      sub: LINKED_USER_ID,
      email: 'alice@example.com',
      user_metadata: { full_name: 'Alice Johnson' },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/plans/${plan.planId}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const synced = body.participants.find(
      (p: { participantId: string }) =>
        p.participantId === linkedParticipant.participantId
    )

    expect(synced.name).toBe('Alice')
    expect(synced.lastName).toBe('Johnson')
  })

  it('persists sync to database across subsequent fetches', async () => {
    const { plan, linkedParticipant } =
      await createPlanWithLinkedParticipant(db)

    const jwt = await signTestJwt({
      sub: LINKED_USER_ID,
      email: 'persistent@example.com',
      user_metadata: { first_name: 'Persisted', last_name: 'User' },
    })

    await app.inject({
      method: 'GET',
      url: `/plans/${plan.planId}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    const [dbRecord] = await db
      .select()
      .from(participants)
      .where(eq(participants.participantId, linkedParticipant.participantId))

    expect(dbRecord.name).toBe('Persisted')
    expect(dbRecord.lastName).toBe('User')
    expect(dbRecord.contactEmail).toBe('persistent@example.com')
  })

  it('does not affect other participants in the plan', async () => {
    const { plan, ownerParticipant } = await createPlanWithLinkedParticipant(db)

    const jwt = await signTestJwt({
      sub: LINKED_USER_ID,
      email: 'changed@example.com',
      user_metadata: { first_name: 'Changed' },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/plans/${plan.planId}`,
      headers: { authorization: `Bearer ${jwt}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const owner = body.participants.find(
      (p: { participantId: string }) =>
        p.participantId === ownerParticipant.participantId
    )

    expect(owner.name).toBe('Owner')
    expect(owner.lastName).toBe('Person')
  })
})
