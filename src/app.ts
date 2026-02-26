import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { config } from './config.js'
import { registerSchemas } from './schemas/index.js'
import { healthRoutes } from './routes/health.route.js'
import { plansRoutes } from './routes/plans.route.js'
import { itemsRoutes } from './routes/items.route.js'
import { participantsRoutes } from './routes/participants.route.js'
import { inviteRoutes } from './routes/invite.route.js'
import { authRoutes } from './routes/auth.route.js'
import { claimRoutes } from './routes/claim.route.js'
import { Database } from './db/index.js'
import authPlugin, { AuthPluginOptions } from './plugins/auth.js'
import guestAuthPlugin from './plugins/guest-auth.js'

export interface AppDependencies {
  db: Database
}

export interface BuildAppOptions {
  enableDocs?: boolean
  logger?: false
  auth?: AuthPluginOptions
}

export async function buildApp(
  deps: AppDependencies,
  options: BuildAppOptions = {}
) {
  const { enableDocs = config.isDev, logger, auth } = options

  const fastify = Fastify({
    logger:
      logger === false
        ? false
        : {
            level: config.logLevel,
            transport: config.isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
          },
  })

  fastify.decorate('db', deps.db)

  registerSchemas(fastify)

  if (enableDocs) {
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Chillist API',
          description: 'Trip planning with shared checklists',
          version: '1.0.0',
        },
        tags: [
          { name: 'health', description: 'Health check endpoints' },
          { name: 'plans', description: 'Plan management' },
          { name: 'participants', description: 'Participant management' },
          { name: 'items', description: 'Item management' },
          { name: 'invite', description: 'Invite link access' },
          { name: 'guest', description: 'Guest access via invite token' },
          { name: 'auth', description: 'Authentication' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    })

    await fastify.register(swaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    })
  }

  await fastify.register(cors, {
    origin: config.isDev ? true : config.frontendUrl,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  await fastify.register(helmet, {
    contentSecurityPolicy: config.isDev ? false : undefined,
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  await fastify.register(authPlugin, auth ?? {})
  await fastify.register(guestAuthPlugin)

  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/health')) {
      return
    }

    request.log.info(
      {
        method: request.method,
        url: request.url,
        origin: request.headers.origin ?? null,
        hasJwt: !!request.headers.authorization?.startsWith('Bearer '),
        hasInviteToken: !!request.headers['x-invite-token'],
      },
      'Incoming request'
    )
  })

  fastify.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/health')) {
      return
    }

    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        userId: request.user?.id ?? null,
        guestParticipantId: request.guestParticipant?.participantId ?? null,
        corsOrigin: reply.getHeader('access-control-allow-origin') ?? null,
        responseTimeMs: reply.elapsedTime,
      },
      'Request completed'
    )
  })

  await fastify.register(healthRoutes)
  await fastify.register(plansRoutes)
  await fastify.register(participantsRoutes)
  await fastify.register(itemsRoutes)
  await fastify.register(inviteRoutes)
  await fastify.register(authRoutes)
  await fastify.register(claimRoutes)

  return fastify
}
