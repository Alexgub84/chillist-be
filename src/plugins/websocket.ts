import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import { FastifyInstance } from 'fastify'
import { WebSocket } from 'ws'
import {
  createRemoteJWKSet,
  jwtVerify,
  JWSHeaderParameters,
  FlattenedJWSInput,
  JWTPayload,
} from 'jose'
import { config } from '../config.js'
import { checkPlanAccess } from '../utils/plan-access.js'

type JWKSResolver = (
  protectedHeader?: JWSHeaderParameters,
  token?: FlattenedJWSInput
) => Promise<CryptoKey>

const planConnections = new Map<string, Set<WebSocket>>()

function addConnection(planId: string, ws: WebSocket) {
  let connections = planConnections.get(planId)
  if (!connections) {
    connections = new Set()
    planConnections.set(planId, connections)
  }
  connections.add(ws)
}

function removeConnection(planId: string, ws: WebSocket) {
  const connections = planConnections.get(planId)
  if (!connections) return
  connections.delete(ws)
  if (connections.size === 0) {
    planConnections.delete(planId)
  }
}

function broadcastToPlan(
  planId: string,
  message: string,
  log: { warn: (obj: object, msg: string) => void }
) {
  const connections = planConnections.get(planId)
  if (!connections) return
  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message)
      } catch (err) {
        log.warn({ err, planId }, 'WebSocket send failed — removing connection')
        removeConnection(planId, ws)
      }
    }
  }
}

export interface WebSocketPluginOptions {
  jwks?: JWKSResolver
  issuer?: string
}

async function websocketPlugin(
  fastify: FastifyInstance,
  opts: WebSocketPluginOptions = {}
) {
  await fastify.register(websocket)

  let jwks = opts.jwks
  let issuer = opts.issuer

  if (!jwks && config.supabaseUrl) {
    const jwksUrl = new URL(
      '/auth/v1/.well-known/jwks.json',
      config.supabaseUrl
    )
    jwks = createRemoteJWKSet(jwksUrl) as JWKSResolver
    issuer = issuer ?? `${config.supabaseUrl}/auth/v1`
  }

  const verifyOpts = {
    ...(issuer && { issuer }),
    clockTolerance: 30,
  }

  fastify.decorate('notifyItemChange', (planId: string) => {
    const message = JSON.stringify({ event: 'items:changed', planId })
    broadcastToPlan(planId, message, fastify.log)
    fastify.log.info(
      { planId, connections: planConnections.get(planId)?.size ?? 0 },
      'WebSocket item change notification sent'
    )
  })

  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId/ws',
    { websocket: true },
    async (socket, request) => {
      const { planId } = request.params

      const url = new URL(request.url, 'http://localhost')
      const token = url.searchParams.get('token')

      if (!token) {
        request.log.warn({ planId }, 'WebSocket rejected — missing token')
        socket.close(4001, 'Missing token')
        return
      }

      let jwtPayload: JWTPayload | null = null
      if (jwks) {
        try {
          const { payload } = await jwtVerify(token, jwks, verifyOpts)
          jwtPayload = payload
        } catch (err) {
          const errorType =
            err instanceof Error ? err.constructor.name : 'Unknown'
          request.log.warn(
            { planId, errorType },
            'WebSocket rejected — invalid token'
          )
          socket.close(4003, 'Invalid token')
          return
        }
      }

      const userId = jwtPayload?.sub ?? null
      const user = userId
        ? {
            id: userId,
            email: String((jwtPayload as Record<string, unknown>)?.email ?? ''),
            role: String(
              (
                (jwtPayload as Record<string, unknown>)?.app_metadata as
                  | Record<string, unknown>
                  | undefined
              )?.role ??
                (jwtPayload as Record<string, unknown>)?.role ??
                'authenticated'
            ),
          }
        : null

      try {
        const { allowed } = await checkPlanAccess(fastify.db, planId, user)

        if (!allowed) {
          request.log.warn(
            { planId, userId },
            'WebSocket rejected — plan not found or access denied'
          )
          socket.close(4004, 'Plan not found')
          return
        }
      } catch (err) {
        request.log.error(
          { err, planId, userId },
          'WebSocket rejected — database error during access check'
        )
        socket.close(4500, 'Server error')
        return
      }

      addConnection(planId, socket)

      request.log.info(
        { planId, userId, connections: planConnections.get(planId)?.size ?? 0 },
        'WebSocket client connected'
      )

      socket.on('close', () => {
        removeConnection(planId, socket)
        request.log.info(
          {
            planId,
            userId,
            connections: planConnections.get(planId)?.size ?? 0,
          },
          'WebSocket client disconnected'
        )
      })
    }
  )
}

export default fp(websocketPlugin, {
  name: 'websocket',
  dependencies: ['auth'],
})
