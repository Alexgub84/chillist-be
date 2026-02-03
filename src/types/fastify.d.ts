import { Database } from '../db/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
  }
}
