import fp from 'fastify-plugin'
import { createHash } from 'node:crypto'
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

      if (!participant) {
        request.log.warn(
          { inviteToken: inviteToken.slice(0, 8) + '...' },
          'Invite token not found in database'
        )
        return
      }

      request.guestParticipant = {
        participantId: participant.participantId,
        planId: participant.planId,
      }

      const guestSessionId =
        'guest_' +
        createHash('sha256').update(inviteToken).digest('hex').slice(0, 16)
      request.sessionId = guestSessionId

      await fastify.db
        .update(participants)
        .set({ lastActivityAt: new Date() })
        .where(eq(participants.participantId, participant.participantId))

      request.log.info(
        {
          participantId: participant.participantId,
          planId: participant.planId,
          sessionId: guestSessionId,
        },
        'Guest authenticated via invite token'
      )
    } catch (err) {
      request.log.warn(
        { err },
        'Guest auth lookup failed — request.guestParticipant will be null'
      )
    }
  })
}

export default fp(guestAuthPlugin, { name: 'guest-auth' })
