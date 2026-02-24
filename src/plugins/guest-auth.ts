import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { eq } from 'drizzle-orm'
import { participants } from '../db/schema.js'

export interface GuestParticipant {
  participantId: string
  planId: string
}

async function guestAuthPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('guestParticipant', null)

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const inviteToken = request.headers['x-invite-token']
    if (!inviteToken || typeof inviteToken !== 'string') return

    try {
      const [participant] = await fastify.db
        .select({
          participantId: participants.participantId,
          planId: participants.planId,
        })
        .from(participants)
        .where(eq(participants.inviteToken, inviteToken))

      if (!participant) return

      request.guestParticipant = {
        participantId: participant.participantId,
        planId: participant.planId,
      }

      await fastify.db
        .update(participants)
        .set({ lastActivityAt: new Date() })
        .where(eq(participants.participantId, participant.participantId))
    } catch (err) {
      request.log.warn(
        { err },
        'Guest auth lookup failed — request.guestParticipant will be null'
      )
    }
  })
}

export default fp(guestAuthPlugin, { name: 'guest-auth' })
