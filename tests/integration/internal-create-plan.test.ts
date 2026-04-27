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
import { plans, participants, users } from '../../src/db/schema.js'

const VALID_SERVICE_KEY = 'test-service-key-create-plan-abc123'
const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('Internal Create Plan — POST /api/internal/plans', () => {
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

  async function createPlan(
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/internal/plans',
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
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/plans',
        headers: {
          'x-user-id': USER_ID,
          'content-type': 'application/json',
        },
        payload: { title: 'Trip' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 with invalid x-service-key', async () => {
      const response = await createPlan(
        { title: 'Trip' },
        { 'x-service-key': 'wrong-key', 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ message: 'Unauthorized' })
    })

    it('returns 401 when x-user-id is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/internal/plans',
        headers: {
          'x-service-key': VALID_SERVICE_KEY,
          'content-type': 'application/json',
        },
        payload: { title: 'Trip' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        message: 'x-user-id header required',
      })
    })
  })

  describe('Validation and owner resolution', () => {
    beforeEach(async () => {
      await db.insert(users).values({
        userId: USER_ID,
        phone: '+15551230001',
      })
    })

    it('returns 400 when title is empty', async () => {
      const response = await createPlan(
        { title: '   ' },
        { 'x-user-id': USER_ID }
      )
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ message: 'title is required' })
    })

    it('returns 400 when startDate is invalid', async () => {
      const response = await createPlan(
        { title: 'Trip', startDate: 'not-a-date' },
        { 'x-user-id': USER_ID }
      )
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        message: 'Invalid startDate or endDate',
      })
    })

    it('returns 400 when no E.164 phone can be resolved', async () => {
      await db.delete(users).where(eq(users.userId, USER_ID))

      const response = await createPlan(
        { title: 'Trip' },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
      expect(response.json().message).toMatch(/phone/i)
    })
  })

  describe('Success', () => {
    beforeEach(async () => {
      await db.insert(users).values({
        userId: USER_ID,
        phone: '+15551230002',
      })
    })

    it('returns 201 with minimal body and creates owner participant', async () => {
      const response = await createPlan(
        { title: 'Camping Trip' },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as {
        plan: { id: string; name: string; date: string | null }
      }
      expect(json.plan.name).toBe('Camping Trip')
      expect(json.plan.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
      expect(json.plan.date).toBeNull()

      const [planRow] = await db
        .select()
        .from(plans)
        .where(eq(plans.planId, json.plan.id))

      expect(planRow).toBeDefined()
      expect(planRow!.title).toBe('Camping Trip')
      expect(planRow!.createdByUserId).toBe(USER_ID)
      expect(planRow!.visibility).toBe('invite_only')

      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.role).toBe('owner')
      expect(participantRow!.userId).toBe(USER_ID)
      expect(participantRow!.contactPhone).toBe('+15551230002')
      expect(participantRow!.rsvpStatus).toBe('pending')
      expect(participantRow!.adultsCount).toBeNull()
      expect(participantRow!.kidsCount).toBeNull()
      expect(participantRow!.foodPreferences).toBeNull()
      expect(participantRow!.allergies).toBeNull()
    })

    it('persists optional fields including YYYY-MM-DD dates and locationName', async () => {
      const response = await createPlan(
        {
          title: 'Weekend',
          description: 'At the lake',
          startDate: '2026-07-04',
          endDate: '2026-07-06',
          tags: ['camping'],
          defaultLang: 'en',
          estimatedAdults: 2,
          estimatedKids: 1,
          locationName: 'Lake Tahoe',
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as {
        plan: { id: string; name: string; date: string | null }
      }

      expect(json.plan.date).toBe('2026-07-04T00:00:00.000Z')

      const [planRow] = await db
        .select()
        .from(plans)
        .where(eq(plans.planId, json.plan.id))

      expect(planRow!.description).toBe('At the lake')
      expect(planRow!.tags).toEqual(['camping'])
      expect(planRow!.defaultLang).toBe('en')
      expect(planRow!.estimatedAdults).toBe(2)
      expect(planRow!.estimatedKids).toBe(1)
      expect(planRow!.location).toMatchObject({
        name: 'Lake Tahoe',
      })
      expect(planRow!.location?.locationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })
  })

  describe('ownerPreferences', () => {
    beforeEach(async () => {
      await db.insert(users).values({
        userId: USER_ID,
        phone: '+15551230003',
      })
    })

    it('applies all ownerPreferences fields to the owner participant', async () => {
      const response = await createPlan(
        {
          title: 'Bot Trip',
          ownerPreferences: {
            rsvpStatus: 'confirmed',
            adultsCount: 2,
            kidsCount: 1,
            foodPreferences: 'vegetarian',
            allergies: 'nuts',
          },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as { plan: { id: string } }
      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.rsvpStatus).toBe('confirmed')
      expect(participantRow!.adultsCount).toBe(2)
      expect(participantRow!.kidsCount).toBe(1)
      expect(participantRow!.foodPreferences).toBe('vegetarian')
      expect(participantRow!.allergies).toBe('nuts')
    })

    it('applies only rsvpStatus when other keys are omitted', async () => {
      const response = await createPlan(
        {
          title: 'Partial Prefs',
          ownerPreferences: { rsvpStatus: 'not_sure' },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as { plan: { id: string } }
      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.rsvpStatus).toBe('not_sure')
      expect(participantRow!.adultsCount).toBeNull()
      expect(participantRow!.kidsCount).toBeNull()
    })

    it('applies dietary strings without RSVP or counts', async () => {
      const response = await createPlan(
        {
          title: 'Diet only',
          ownerPreferences: {
            foodPreferences: 'vegan',
            allergies: 'shellfish',
          },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as { plan: { id: string } }
      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.rsvpStatus).toBe('pending')
      expect(participantRow!.foodPreferences).toBe('vegan')
      expect(participantRow!.allergies).toBe('shellfish')
    })

    it('treats ownerPreferences null like omitted', async () => {
      const response = await createPlan(
        { title: 'Null prefs', ownerPreferences: null },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as { plan: { id: string } }
      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.rsvpStatus).toBe('pending')
      expect(participantRow!.adultsCount).toBeNull()
    })

    it('accepts empty ownerPreferences object', async () => {
      const response = await createPlan(
        { title: 'Empty prefs', ownerPreferences: {} },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as { plan: { id: string } }
      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.rsvpStatus).toBe('pending')
    })

    it('returns 400 when rsvpStatus is invalid', async () => {
      const response = await createPlan(
        {
          title: 'Bad rsvp',
          ownerPreferences: { rsvpStatus: 'maybe' },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when adultsCount is negative', async () => {
      const response = await createPlan(
        {
          title: 'Bad adults',
          ownerPreferences: { adultsCount: -1 },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when kidsCount is not an integer', async () => {
      const response = await createPlan(
        {
          title: 'Bad kids',
          ownerPreferences: { kidsCount: 1.5 },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(400)
    })

    it('allows zero counts with confirmed RSVP', async () => {
      const response = await createPlan(
        {
          title: 'Zeros',
          ownerPreferences: {
            rsvpStatus: 'confirmed',
            adultsCount: 0,
            kidsCount: 0,
          },
        },
        { 'x-user-id': USER_ID }
      )

      expect(response.statusCode).toBe(201)
      const json = response.json() as { plan: { id: string } }
      const [participantRow] = await db
        .select()
        .from(participants)
        .where(eq(participants.planId, json.plan.id))

      expect(participantRow!.rsvpStatus).toBe('confirmed')
      expect(participantRow!.adultsCount).toBe(0)
      expect(participantRow!.kidsCount).toBe(0)
    })
  })
})
