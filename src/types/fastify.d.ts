import { Database } from '../db/index.js'
import { JwtUser } from '../plugins/auth.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    jwtEnabled: boolean
  }

  interface FastifyRequest {
    user: JwtUser | null
  }
}
