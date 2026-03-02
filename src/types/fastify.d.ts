import { Database } from '../db/index.js'
import { JwtUser } from '../plugins/auth.js'
import { GuestParticipant } from '../plugins/guest-auth.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    jwtEnabled: boolean
    notifyItemChange: (planId: string) => void
  }

  interface FastifyRequest {
    user: JwtUser | null
    guestParticipant: GuestParticipant | null
  }
}
