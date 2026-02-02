import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { healthRoutes } from './routes/health.route.js'
import { plansRoutes } from './routes/plans.route.js'
import { Database } from './db/index.js'

export interface AppDependencies {
  db: Database
}

export async function buildApp(deps: AppDependencies) {
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

  await fastify.register(cors, {
    origin: config.isDev ? true : config.frontendUrl,
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

  return fastify
}
