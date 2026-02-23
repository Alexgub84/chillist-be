import fp from 'fastify-plugin'
import {
  createRemoteJWKSet,
  jwtVerify,
  JWTPayload,
  FlattenedJWSInput,
  JWSHeaderParameters,
} from 'jose'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { config } from '../config.js'

export interface JwtUser {
  id: string
  email: string
  role: string
}

export type JWKSResolver = (
  protectedHeader?: JWSHeaderParameters,
  token?: FlattenedJWSInput
) => Promise<CryptoKey>

interface SupabaseJwtPayload extends JWTPayload {
  email?: string
  role?: string
  app_metadata?: { role?: string }
}

function extractUser(payload: SupabaseJwtPayload): JwtUser | null {
  if (!payload.sub) return null

  return {
    id: payload.sub,
    email: payload.email ?? '',
    role: payload.app_metadata?.role ?? payload.role ?? 'authenticated',
  }
}

export interface AuthPluginOptions {
  jwks?: JWKSResolver
  issuer?: string
}

async function authPlugin(
  fastify: FastifyInstance,
  opts: AuthPluginOptions = {}
) {
  fastify.decorateRequest('user', null)
  fastify.decorate('jwtEnabled', false)

  let jwks = opts.jwks
  let issuer = opts.issuer

  if (!jwks) {
    if (!config.supabaseUrl) {
      fastify.log.warn(
        'SUPABASE_URL not configured — JWT verification disabled'
      )
      return
    }

    const jwksUrl = new URL(
      '/auth/v1/.well-known/jwks.json',
      config.supabaseUrl
    )
    jwks = createRemoteJWKSet(jwksUrl) as JWKSResolver
    issuer = issuer ?? `${config.supabaseUrl}/auth/v1`
  }

  fastify.jwtEnabled = true

  const verifyOpts = issuer ? { issuer } : undefined

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return

    const token = authHeader.slice(7)

    try {
      const { payload } = await jwtVerify(token, jwks!, verifyOpts)

      request.user = extractUser(payload as SupabaseJwtPayload)
    } catch (err) {
      request.log.warn(
        { err },
        'JWT verification failed — request.user will be null'
      )
    }
  })
}

export default fp(authPlugin, { name: 'auth' })
