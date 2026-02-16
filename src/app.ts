import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { config } from './config.js'
import { registerSchemas } from './schemas/index.js'
import { healthRoutes } from './routes/health.route.js'
import { plansRoutes } from './routes/plans.route.js'
import { itemsRoutes } from './routes/items.route.js'
import { participantsRoutes } from './routes/participants.route.js'
import { inviteRoutes } from './routes/invite.route.js'
import { Database } from './db/index.js'

export interface AppDependencies {
  db: Database
}

export interface BuildAppOptions {
  enableDocs?: boolean
  logger?: false
}

export async function buildApp(
  deps: AppDependencies,
  options: BuildAppOptions = {}
) {
  const { enableDocs = config.isDev, logger } = options

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
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              name: 'x-api-key',
              in: 'header',
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

  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/health')) {
      return
    }

    request.log.info(
      {
        method: request.method,
        url: request.url,
        origin: request.headers.origin ?? null,
        hasApiKey: !!request.headers['x-api-key'],
      },
      'Incoming request'
    )
  })

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS' || request.url.startsWith('/health')) {
      return
    }

    const invitePattern = /^\/plans\/[^/]+\/invite\/[^/]+$/
    if (invitePattern.test(request.url)) {
      return
    }

    if (config.apiKey && request.headers['x-api-key'] !== config.apiKey) {
      return reply.status(401).send({ message: 'Unauthorized' })
    }
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

  return fastify
}
