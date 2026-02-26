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
  firstName?: string
  lastName?: string
  phone?: string
  avatarUrl?: string
}

export type JWKSResolver = (
  protectedHeader?: JWSHeaderParameters,
  token?: FlattenedJWSInput
) => Promise<CryptoKey>

interface SupabaseUserMetadata {
  first_name?: string
  last_name?: string
  full_name?: string
  name?: string
  phone?: string
  avatar_url?: string
}

interface SupabaseJwtPayload extends JWTPayload {
  email?: string
  role?: string
  app_metadata?: { role?: string }
  user_metadata?: SupabaseUserMetadata
}

function parseNameFromMetadata(metadata: SupabaseUserMetadata): {
  firstName?: string
  lastName?: string
} {
  if (metadata.first_name || metadata.last_name) {
    return {
      ...(metadata.first_name && { firstName: metadata.first_name }),
      ...(metadata.last_name && { lastName: metadata.last_name }),
    }
  }

  const fullName = metadata.full_name || metadata.name
  if (!fullName) return {}

  const spaceIndex = fullName.indexOf(' ')
  if (spaceIndex > 0) {
    return {
      firstName: fullName.slice(0, spaceIndex),
      lastName: fullName.slice(spaceIndex + 1),
    }
  }

  return { firstName: fullName }
}

function extractUser(payload: SupabaseJwtPayload): JwtUser | null {
  if (!payload.sub) return null

  const meta = payload.user_metadata
  const names = meta ? parseNameFromMetadata(meta) : {}

  return {
    id: payload.sub,
    email: payload.email ?? '',
    role: payload.app_metadata?.role ?? payload.role ?? 'authenticated',
    ...names,
    ...(meta?.phone && { phone: meta.phone }),
    ...(meta?.avatar_url && { avatarUrl: meta.avatar_url }),
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

    fastify.log.info(
      { jwksUrl: jwksUrl.toString(), issuer },
      'JWT verification enabled — JWKS configured'
    )
  }

  fastify.jwtEnabled = true

  const verifyOpts = {
    ...(issuer && { issuer }),
    clockTolerance: 30,
  }

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return

    const token = authHeader.slice(7)

    try {
      const { payload } = await jwtVerify(token, jwks!, verifyOpts)

      request.user = extractUser(payload as SupabaseJwtPayload)

      if (request.user) {
        request.log.info(
          { userId: request.user.id, role: request.user.role },
          'User authenticated via JWT'
        )
      }
    } catch (err) {
      const errorType = err instanceof Error ? err.constructor.name : 'Unknown'
      request.log.warn(
        { err, errorType },
        'JWT verification failed — request.user will be null'
      )
    }
  })
}

export default fp(authPlugin, { name: 'auth' })
