import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { healthRoutes } from './routes/health.route.js'

export async function buildApp() {
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

  await fastify.register(cors, {
    origin: true,
  })

  await fastify.register(healthRoutes)

  return fastify
}
