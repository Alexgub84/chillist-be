import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  closeTestDatabase,
  getTestDb,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { planTagVersions, planTagOptions } from '../../src/db/schema.js'
import type { TierLabels } from '../../src/db/schema.js'

const SERVICE_KEY = 'test-service-key-12345'

const TIER_LABELS: TierLabels = {
  tier1: { label: 'What kind of trip is this?', key: 'plan_type' },
  tier2: {
    label: 'Tell us a bit more',
    key: 'logistics',
    conditional_on: 'tier1',
  },
  tier3: {
    label: 'A few more details',
    key: 'specifics',
    conditional_on: 'tier2',
  },
}

async function seedMinimalTaxonomy() {
  const db = await getTestDb()
  const [version] = await db
    .insert(planTagVersions)
    .values({
      version: '1.0',
      description: 'Test taxonomy',
      tierLabels: TIER_LABELS,
    })
    .returning()

  await db.insert(planTagOptions).values([
    {
      id: 'camping',
      versionId: version.id,
      tier: 1,
      parentId: null,
      label: 'Camping',
      emoji: '⛺',
      sortOrder: 0,
    },
    {
      id: 'camping_tent',
      versionId: version.id,
      tier: 2,
      parentId: 'camping',
      label: 'Tent',
      sortOrder: 0,
      mutexGroup: 'sleep',
    },
    {
      id: 'camping_cabin',
      versionId: version.id,
      tier: 2,
      parentId: 'camping',
      label: 'Cabin',
      sortOrder: 1,
      mutexGroup: 'sleep',
    },
    {
      id: 'tent_shared',
      versionId: version.id,
      tier: 3,
      parentId: 'camping_tent',
      label: 'Sharing tents',
      sortOrder: 0,
    },
  ])

  return version
}

async function clearTaxonomy() {
  const db = await getTestDb()
  await db.delete(planTagVersions)
}

describe('GET /plan-tags (FE endpoint — JWT required)', () => {
  let app: FastifyInstance
  let userToken: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    userToken = await signTestJwt({
      sub: 'aaaaaaaa-1111-2222-3333-444444444444',
    })
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        rateLimit: false,
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await clearTaxonomy()
  })

  it('returns 401 without JWT', async () => {
    const response = await app.inject({ method: 'GET', url: '/plan-tags' })
    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with invalid JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: 'Bearer not-a-real-token' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 404 when no taxonomy exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().message).toBe('No tag taxonomy found')
  })

  it('returns 200 with full taxonomy structure when authenticated', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${userToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()

    expect(body.version).toBe('1.0')
    expect(body.description).toBe('Test taxonomy')
    expect(body.tiers).toBeDefined()
    expect(body.tiers.tier1).toBeDefined()
    expect(body.tiers.tier2).toBeDefined()
    expect(body.tiers.tier3).toBeDefined()
  })

  it('returns tier1 options array', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${userToken}` },
    })

    const body = response.json()
    expect(body.tiers.tier1.options).toHaveLength(1)
    expect(body.tiers.tier1.options[0]).toEqual({
      id: 'camping',
      label: 'Camping',
      emoji: '⛺',
    })
  })

  it('returns tier2 options_by_parent with mutex_groups', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${userToken}` },
    })

    const body = response.json()
    const camping = body.tiers.tier2.options_by_parent['camping']
    expect(camping).toBeDefined()
    expect(camping.options).toHaveLength(2)
    expect(camping.mutex_groups).toContainEqual([
      'camping_tent',
      'camping_cabin',
    ])
    expect(camping.cross_group_rules).toEqual([])
  })

  it('returns tier3 options_by_parent', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${userToken}` },
    })

    const body = response.json()
    expect(body.tiers.tier3.options_by_parent['camping_tent']).toEqual([
      { id: 'tent_shared', label: 'Sharing tents' },
    ])
  })

  it('returns the latest version when multiple versions exist', async () => {
    const db = await getTestDb()
    await seedMinimalTaxonomy()

    const [v2] = await db
      .insert(planTagVersions)
      .values({
        version: '2.0',
        description: 'Newer taxonomy',
        tierLabels: TIER_LABELS,
      })
      .returning()

    await db.insert(planTagOptions).values([
      {
        id: 'beach',
        versionId: v2.id,
        tier: 1,
        parentId: null,
        label: 'Beach',
        emoji: '🏖️',
        sortOrder: 0,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/plan-tags',
      headers: { authorization: `Bearer ${userToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().version).toBe('2.0')
  })
})

describe('GET /api/internal/plan-tags (chatbot endpoint — x-service-key)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    process.env.CHATBOT_SERVICE_KEY = SERVICE_KEY
    app = await buildApp({ db }, { logger: false, rateLimit: false })
  })

  afterAll(async () => {
    await app.close()
    delete process.env.CHATBOT_SERVICE_KEY
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await clearTaxonomy()
  })

  it('returns 401 without x-service-key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with invalid x-service-key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': 'wrong-key' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 404 when no taxonomy exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': SERVICE_KEY },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().message).toBe('No tag taxonomy found')
  })

  it('returns 200 with full taxonomy using valid service key', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': SERVICE_KEY },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.version).toBe('1.0')
    expect(body.tiers.tier1.options[0].id).toBe('camping')
  })

  it('works without x-user-id header — taxonomy is not user-specific', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': SERVICE_KEY },
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns the same taxonomy version as the FE endpoint (both read latest version)', async () => {
    await seedMinimalTaxonomy()

    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/plan-tags',
      headers: { 'x-service-key': SERVICE_KEY },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.version).toBe('1.0')
    expect(body.tiers.tier1).toBeDefined()
    expect(body.tiers.tier2).toBeDefined()
    expect(body.tiers.tier3).toBeDefined()
  })
})
