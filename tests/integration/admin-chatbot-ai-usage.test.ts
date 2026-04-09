import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
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
import { chatbotAiUsage } from '../../src/db/schema.js'
import type { NewChatbotAiUsageLog } from '../../src/db/schema.js'

const ADMIN_USER_ID = 'dddddddd-1111-2222-3333-444444444444'
const REGULAR_USER_ID = 'eeeeeeee-1111-2222-3333-444444444444'
const SESSION_ID = 'ffffffff-1111-2222-3333-444444444444'

function makeLog(
  overrides: Partial<NewChatbotAiUsageLog> = {}
): NewChatbotAiUsageLog {
  return {
    id: randomUUID(),
    sessionId: SESSION_ID,
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    chatType: 'dm',
    messageIndex: 0,
    stepCount: 1,
    toolCallCount: 0,
    toolCalls: [],
    durationMs: 500,
    status: 'success',
    createdAt: new Date('2026-03-28T10:00:00Z'),
    ...overrides,
  }
}

describe('GET /admin/chatbot-ai-usage integration', () => {
  let app: FastifyInstance
  let adminToken: string
  let regularToken: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    adminToken = await signTestJwt({
      sub: ADMIN_USER_ID,
      app_metadata: { role: 'admin' },
    })
    regularToken = await signTestJwt({ sub: REGULAR_USER_ID })
    app = await buildApp(
      { db },
      { logger: false, auth: { jwks: getTestJWKS(), issuer: getTestIssuer() } }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    const db = await getTestDb()
    await db.delete(chatbotAiUsage)
    await cleanupTestDatabase()
  })

  it('returns 401 without an auth header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 403 for a non-admin JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage',
      headers: { authorization: `Bearer ${regularToken}` },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Admin access required')
  })

  it('returns 200 with empty result when table has no data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.logs).toEqual([])
    expect(body.total).toBe(0)
    expect(body.summary.totalRequests).toBe(0)
    expect(body.summary.totalInputTokens).toBe(0)
    expect(body.summary.totalOutputTokens).toBe(0)
    expect(body.summary.totalEstimatedCost).toBeNull()
    expect(body.summary.byModel).toEqual([])
    expect(body.summary.byChatType).toEqual([])
    expect(body.summary.byToolCalls).toEqual([])
  })

  it('returns 200 with logs, total, and summary when rows exist', async () => {
    const db = await getTestDb()
    await db.insert(chatbotAiUsage).values([
      makeLog({
        userId: ADMIN_USER_ID,
        sessionId: SESSION_ID,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCost: '0.004800',
      }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.logs).toHaveLength(1)
    expect(body.logs[0].modelId).toBe('claude-sonnet-4-20250514')
    expect(body.logs[0].chatType).toBe('dm')
    expect(body.logs[0].status).toBe('success')
    expect(body.summary.totalRequests).toBe(1)
    expect(body.summary.totalInputTokens).toBe(100)
    expect(body.summary.totalOutputTokens).toBe(200)
    expect(body.summary.byModel).toHaveLength(1)
    expect(body.summary.byModel[0].modelId).toBe('claude-sonnet-4-20250514')
    expect(body.summary.byChatType).toHaveLength(1)
    expect(body.summary.byChatType[0].chatType).toBe('dm')
    expect(body.summary.byToolCalls).toEqual([])
  })

  it('filters results by chatType', async () => {
    const db = await getTestDb()
    await db
      .insert(chatbotAiUsage)
      .values([
        makeLog({ id: randomUUID(), chatType: 'dm' }),
        makeLog({ id: randomUUID(), chatType: 'group' }),
        makeLog({ id: randomUUID(), chatType: 'group' }),
      ])

    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage?chatType=group',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(2)
    expect(body.logs).toHaveLength(2)
    body.logs.forEach((log: { chatType: string }) =>
      expect(log.chatType).toBe('group')
    )
  })

  it('aggregates byToolCalls from tool_calls JSONB arrays', async () => {
    const db = await getTestDb()
    await db.insert(chatbotAiUsage).values([
      makeLog({
        id: randomUUID(),
        toolCalls: ['lookup_plan', 'add_item'],
        toolCallCount: 2,
      }),
      makeLog({
        id: randomUUID(),
        toolCalls: ['lookup_plan'],
        toolCallCount: 1,
      }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.summary.byToolCalls).toHaveLength(2)
    const lookup = body.summary.byToolCalls.find(
      (r: { toolName: string }) => r.toolName === 'lookup_plan'
    )
    const addItem = body.summary.byToolCalls.find(
      (r: { toolName: string }) => r.toolName === 'add_item'
    )
    expect(lookup?.count).toBe(2)
    expect(addItem?.count).toBe(1)
  })

  it('respects limit and offset pagination', async () => {
    const db = await getTestDb()
    await db.insert(chatbotAiUsage).values([
      makeLog({
        id: randomUUID(),
        createdAt: new Date('2026-03-28T10:00:00Z'),
      }),
      makeLog({
        id: randomUUID(),
        createdAt: new Date('2026-03-28T11:00:00Z'),
      }),
      makeLog({
        id: randomUUID(),
        createdAt: new Date('2026-03-28T12:00:00Z'),
      }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/admin/chatbot-ai-usage?limit=2&offset=0',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(3)
    expect(body.logs).toHaveLength(2)
  })
})
