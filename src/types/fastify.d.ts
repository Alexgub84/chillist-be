import { Database } from '../db/index.js'
import { JwtUser } from '../plugins/auth.js'
import { GuestParticipant } from '../plugins/guest-auth.js'
import { IWhatsAppService } from '../services/whatsapp/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    jwtEnabled: boolean
    notifyItemChange: (planId: string) => void
    whatsapp: IWhatsAppService
  }

  interface FastifyRequest {
    user: JwtUser | null
    guestParticipant: GuestParticipant | null
    internalUserId: string | null
  }
}
