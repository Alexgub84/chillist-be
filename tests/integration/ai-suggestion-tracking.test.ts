import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  getTestDb,
  seedTestAiSuggestions,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'
import { aiSuggestions, items } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('AI Suggestion Tracking', () => {
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

  describe('POST /plans/:planId/items/bulk — source field', () => {
    it('items created without aiSuggestionId have source=manual', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [{ name: 'Tent', category: 'group_equipment', quantity: 1 }],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items[0].source).toBe('manual')
      expect(body.items[0].aiSuggestionId).toBeNull()
    })

    it('items created with valid aiSuggestionId have source=ai_suggestion', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const [suggestion] = await seedTestAiSuggestions(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'group_equipment',
              quantity: 1,
              aiSuggestionId: suggestion.id,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items[0].source).toBe('ai_suggestion')
      expect(body.items[0].aiSuggestionId).toBe(suggestion.id)
    })

    it('marks matching suggestion as accepted in DB after bulk create', async () => {
      const testDb = await getTestDb()
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const [suggestion] = await seedTestAiSuggestions(plan.planId, 1)

      await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: suggestion.name,
              category: suggestion.category,
              quantity: 1,
              aiSuggestionId: suggestion.id,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      await new Promise((r) => setTimeout(r, 50))

      const [updatedSuggestion] = await testDb
        .select()
        .from(aiSuggestions)
        .where(eq(aiSuggestions.id, suggestion.id))

      expect(updatedSuggestion.status).toBe('accepted')
      expect(updatedSuggestion.itemId).toBeTruthy()
    })

    it('sets item_id back-link on the accepted suggestion', async () => {
      const testDb = await getTestDb()
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const [suggestion] = await seedTestAiSuggestions(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: suggestion.name,
              category: suggestion.category,
              quantity: 1,
              aiSuggestionId: suggestion.id,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      await new Promise((r) => setTimeout(r, 50))

      const createdItemId = response.json().items[0].itemId

      const [updatedSuggestion] = await testDb
        .select()
        .from(aiSuggestions)
        .where(eq(aiSuggestions.id, suggestion.id))

      expect(updatedSuggestion.itemId).toBe(createdItemId)
    })

    it('bulk create with mix of manual and AI items works correctly', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const [suggestion] = await seedTestAiSuggestions(plan.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            { name: 'Manual item', category: 'group_equipment', quantity: 1 },
            {
              name: suggestion.name,
              category: suggestion.category,
              quantity: 1,
              aiSuggestionId: suggestion.id,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items).toHaveLength(2)
      expect(body.items[0].source).toBe('manual')
      expect(body.items[0].aiSuggestionId).toBeNull()
      expect(body.items[1].source).toBe('ai_suggestion')
      expect(body.items[1].aiSuggestionId).toBe(suggestion.id)
    })
  })

  describe('POST /plans/:planId/items/bulk — aiSuggestionId validation', () => {
    it('returns 207 error for item with aiSuggestionId not found', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const nonExistentId = '00000000-0000-0000-0000-000000000099'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'group_equipment',
              quantity: 1,
              aiSuggestionId: nonExistentId,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0].message).toContain('not found')
      expect(body.items).toHaveLength(0)
    })

    it('returns 207 error for aiSuggestionId belonging to a different plan', async () => {
      const [plan1] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const [plan2] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan1.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })
      const [suggestion] = await seedTestAiSuggestions(plan2.planId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan1.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'group_equipment',
              quantity: 1,
              aiSuggestionId: suggestion.id,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0].message).toContain('different plan')
    })

    it('returns 207 error for aiSuggestionId already accepted', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const [suggestion] = await seedTestAiSuggestions(plan.planId, 1, {
        status: 'accepted',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            {
              name: 'Tent',
              category: 'group_equipment',
              quantity: 1,
              aiSuggestionId: suggestion.id,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0].message).toContain('already accepted')
    })

    it('valid aiSuggestionId items succeed alongside items with no id in same bulk call', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })
      const [goodSuggestion] = await seedTestAiSuggestions(plan.planId, 1)
      const nonExistentId = '00000000-0000-0000-0000-000000000099'

      const response = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items/bulk`,
        payload: {
          items: [
            { name: 'Manual item', category: 'group_equipment', quantity: 1 },
            {
              name: goodSuggestion.name,
              category: goodSuggestion.category,
              quantity: 1,
              aiSuggestionId: goodSuggestion.id,
            },
            {
              name: 'Bad suggestion item',
              category: 'group_equipment',
              quantity: 1,
              aiSuggestionId: nonExistentId,
            },
          ],
        },
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(207)
      const body = response.json()
      expect(body.items).toHaveLength(2)
      expect(body.errors).toHaveLength(1)
    })
  })

  describe('GET /plans/:planId/items — source field returned', () => {
    it('returns source field on all items', async () => {
      const testDb = await getTestDb()
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      await seedTestParticipants(plan.planId, 1, { ownerUserId: TEST_USER_ID })

      await testDb.insert(items).values([
        {
          planId: plan.planId,
          name: 'Manual item',
          category: 'group_equipment',
          quantity: 1,
          unit: 'pcs',
          source: 'manual',
        },
        {
          planId: plan.planId,
          name: 'AI item',
          category: 'group_equipment',
          quantity: 1,
          unit: 'pcs',
          source: 'ai_suggestion',
        },
      ])

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveLength(2)
      const sources = body.map((i: { source: string }) => i.source)
      expect(sources).toContain('manual')
      expect(sources).toContain('ai_suggestion')
    })
  })
})
