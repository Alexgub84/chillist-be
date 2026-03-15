import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { closeTestDatabase, setupTestDatabase } from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'
import { seedTestPlans, seedTestParticipants } from '../helpers/db.js'
import { items, plans } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'
import {
  GreenApiWhatsAppService,
  HttpGreenApiClient,
} from '../../src/services/whatsapp/green-api.service.js'

function loadEnvFile() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env file not found
  }
}

loadEnvFile()

const GREEN_API_INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN
const WHATSAPP_TEST_PHONE = process.env.WHATSAPP_TEST_PHONE

const OWNER_USER_ID = 'eeeeeeee-1111-2222-3333-444444444444'

describe.skipIf(
  !GREEN_API_INSTANCE_ID || !GREEN_API_TOKEN || !WHATSAPP_TEST_PHONE
)('WhatsApp E2E — Real Green API', () => {
  let app: FastifyInstance
  let ownerToken: string
  let db: Awaited<ReturnType<typeof setupTestDatabase>>

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()
    ownerToken = await signTestJwt({ sub: OWNER_USER_ID })

    const { buildApp } = await import('../../src/app.js')
    const client = new HttpGreenApiClient({
      instanceId: GREEN_API_INSTANCE_ID!,
      token: GREEN_API_TOKEN!,
    })

    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        whatsapp: { greenApiClient: client },
      }
    )
  }, 30000)

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  it('Green API instance is reachable', async () => {
    const url = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE_ID}/getStateInstance/${GREEN_API_TOKEN}`
    const response = await fetch(url)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('stateInstance')
  })

  it('sendMessage delivers to test number', async () => {
    const client = new HttpGreenApiClient({
      instanceId: GREEN_API_INSTANCE_ID!,
      token: GREEN_API_TOKEN!,
    })
    const service = new GreenApiWhatsAppService(client)

    const result = await service.sendMessage(
      WHATSAPP_TEST_PHONE!,
      'Chillist E2E test message — please ignore'
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.messageId).toBeDefined()
      expect(result.messageId).not.toMatch(/^fake-/)
    }
  })

  it('send-list endpoint works end-to-end', async () => {
    const [plan] = await seedTestPlans(1, {
      createdByUserId: OWNER_USER_ID,
    })
    await seedTestParticipants(plan.planId, 1, {
      ownerUserId: OWNER_USER_ID,
    })

    await db
      .update(plans)
      .set({ title: 'E2E WhatsApp Test' })
      .where(eq(plans.planId, plan.planId))

    await db.insert(items).values([
      {
        planId: plan.planId,
        name: 'Test Item',
        quantity: 1,
        unit: 'pcs',
        category: 'equipment' as const,
      },
    ])

    const response = await app.inject({
      method: 'POST',
      url: `/plans/${plan.planId}/send-list`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { phone: WHATSAPP_TEST_PHONE },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.sent).toBe(true)
    expect(body.messageId).toBeDefined()
    expect(body.messageId).not.toMatch(/^fake-/)
  })
})
