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
import { Database } from './db/index.js'

export interface AppDependencies {
  db: Database
}

export interface BuildAppOptions {
  enableDocs?: boolean
}

export async function buildApp(
  deps: AppDependencies,
  options: BuildAppOptions = {}
) {
  const { enableDocs = config.isDev } = options

  const fastify = Fastify({
    logger: {
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

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/health')) {
      return
    }

    if (config.apiKey && request.headers['x-api-key'] !== config.apiKey) {
      return reply.status(401).send({ message: 'Unauthorized' })
    }
  })

  await fastify.register(healthRoutes)
  await fastify.register(plansRoutes)
  await fastify.register(participantsRoutes)
  await fastify.register(itemsRoutes)

  return fastify
}
