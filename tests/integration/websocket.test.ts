import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { WebSocket } from 'ws'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestJoinRequests,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
} from '../helpers/db.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
  signJwtWithWrongKey,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error('Timeout waiting for WebSocket message'))
    }, timeoutMs)
    const onMessage = (data: import('ws').RawData) => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(data.toString())
    }
    ws.on('message', onMessage)
  })
}

function waitForClose(
  ws: WebSocket,
  timeoutMs = 2000
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('close', onClose)
      reject(new Error('Timeout waiting for WebSocket close'))
    }, timeoutMs)
    const onClose = (code: number, reason: Buffer) => {
      clearTimeout(timer)
      ws.off('close', onClose)
      resolve({ code, reason: reason.toString() })
    }
    ws.on('close', onClose)
  })
}

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

describe('WebSocket Item Notifications', () => {
  let app: FastifyInstance
  let token: string
  let serverUrl: string

  beforeAll(async () => {
    const db = await setupTestDatabase()
    await setupTestKeys()
    token = await signTestJwt({ sub: TEST_USER_ID })
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
        websocket: { jwks: getTestJWKS(), issuer: getTestIssuer() },
      }
    )
    await app.listen({ port: 0, host: '127.0.0.1' })
    const addr = app.server?.address()
    const port =
      typeof addr === 'object' && addr !== null && 'port' in addr
        ? addr.port
        : 3333
    serverUrl = `ws://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  describe('GET /plans/:planId/ws', () => {
    it('closes with 4001 when token is missing', async () => {
      const [plan] = await seedTestPlans(1)
      const ws = await app.injectWS(`/plans/${plan.planId}/ws`)
      const { code } = await waitForClose(ws)
      expect(code).toBe(4001)
      ws.close()
    })

    it('closes with 4003 when token is invalid', async () => {
      const [plan] = await seedTestPlans(1)
      const invalidToken = await signJwtWithWrongKey()
      const ws = await app.injectWS(
        `/plans/${plan.planId}/ws?token=${encodeURIComponent(invalidToken)}`
      )
      const { code } = await waitForClose(ws)
      expect(code).toBe(4003)
      ws.close()
    })

    it('closes with 4004 when plan does not exist', async () => {
      const fakePlanId = '00000000-0000-0000-0000-000000000000'
      const ws = await app.injectWS(
        `/plans/${fakePlanId}/ws?token=${encodeURIComponent(token)}`
      )
      const { code } = await waitForClose(ws)
      expect(code).toBe(4004)
      ws.close()
    })

    it('closes with 4004 when user is not a plan participant', async () => {
      const otherUserId = 'bbbbbbbb-1111-2222-3333-444444444444'
      const [plan] = await seedTestPlans(1, {
        createdByUserId: otherUserId,
        visibility: 'private',
      })

      const ws = await app.injectWS(
        `/plans/${plan.planId}/ws?token=${encodeURIComponent(token)}`
      )
      const { code } = await waitForClose(ws)
      expect(code).toBe(4004)
      ws.close()
    })

    it('closes with 4005 when user has a pending join request', async () => {
      const otherUserId = 'bbbbbbbb-1111-2222-3333-444444444444'
      const [plan] = await seedTestPlans(1, {
        createdByUserId: otherUserId,
        visibility: 'private',
      })
      await seedTestJoinRequests(plan.planId, TEST_USER_ID)

      const ws = await app.injectWS(
        `/plans/${plan.planId}/ws?token=${encodeURIComponent(token)}`
      )
      const { code, reason } = await waitForClose(ws)
      expect(code).toBe(4005)
      expect(reason).toBe('Pending join request')
      ws.close()
    })

    it('connects when token and plan are valid', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })

      const ws = await app.injectWS(
        `/plans/${plan.planId}/ws?token=${encodeURIComponent(token)}`
      )

      expect(ws.readyState).toBe(1)

      ws.close()
    })

    it('receives items:changed when item is created via POST', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })

      const ws = await openWebSocket(
        `${serverUrl}/plans/${plan.planId}/ws?token=${encodeURIComponent(token)}`
      )

      const createRes = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 2,
        },
        headers: { authorization: `Bearer ${token}` },
      })
      expect(createRes.statusCode).toBe(201)

      const message = await waitForMessage(ws)
      const parsed = JSON.parse(message)
      expect(parsed).toEqual({ event: 'items:changed', planId: plan.planId })

      ws.close()
    })

    it('receives items:changed when item is updated via PATCH', async () => {
      const [plan] = await seedTestPlans(1, {
        createdByUserId: TEST_USER_ID,
      })
      await seedTestParticipants(plan.planId, 1, {
        ownerUserId: TEST_USER_ID,
      })

      const createRes = await app.inject({
        method: 'POST',
        url: `/plans/${plan.planId}/items`,
        payload: {
          name: 'Tent',
          category: 'equipment',
          quantity: 2,
        },
        headers: { authorization: `Bearer ${token}` },
      })
      const item = createRes.json()

      const ws = await openWebSocket(
        `${serverUrl}/plans/${plan.planId}/ws?token=${encodeURIComponent(token)}`
      )

      await app.inject({
        method: 'PATCH',
        url: `/items/${item.itemId}`,
        payload: { quantity: 3 },
        headers: { authorization: `Bearer ${token}` },
      })

      const message = await waitForMessage(ws)
      const parsed = JSON.parse(message)
      expect(parsed).toEqual({ event: 'items:changed', planId: plan.planId })

      ws.close()
    })
  })
})
