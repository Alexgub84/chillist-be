import { generateKeyPair, SignJWT } from 'jose'
import { JWKSResolver } from '../../src/plugins/auth.js'

const TEST_ISSUER = 'https://test.supabase.co/auth/v1'
const TEST_KID = 'test-key-id'

let privateKey: CryptoKey
let publicKey: CryptoKey

export async function setupTestKeys() {
  const keyPair = await generateKeyPair('ES256')
  privateKey = keyPair.privateKey
  publicKey = keyPair.publicKey
}

export function getTestJWKS(): JWKSResolver {
  return async () => publicKey
}

export function getTestIssuer(): string {
  return TEST_ISSUER
}

interface TestUserMetadata {
  first_name?: string
  last_name?: string
  full_name?: string
  name?: string
  phone?: string
  avatar_url?: string
}

interface TestTokenClaims {
  sub?: string
  email?: string | null
  role?: string | null
  app_metadata?: { role?: string } | null
  user_metadata?: TestUserMetadata | null
  exp?: number
}

export async function signTestJwt(
  claims: TestTokenClaims = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const payload: Record<string, unknown> = {}

  if (claims.email !== null) {
    payload.email = claims.email ?? 'test@example.com'
  }

  if (claims.role !== null) {
    payload.role = claims.role ?? 'authenticated'
  }

  if (claims.app_metadata !== null && claims.app_metadata !== undefined) {
    payload.app_metadata = claims.app_metadata
  }

  if (claims.user_metadata !== null && claims.user_metadata !== undefined) {
    payload.user_metadata = claims.user_metadata
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: TEST_KID })
    .setSubject(claims.sub ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    .setIssuer(TEST_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(claims.exp ?? now + 3600)
    .sign(privateKey)
}

export async function signExpiredJwt(): Promise<string> {
  const pastTime = Math.floor(Date.now() / 1000) - 3600

  return signTestJwt({ exp: pastTime })
}

export async function signJwtWithWrongKey(): Promise<string> {
  const { privateKey: wrongKey } = await generateKeyPair('ES256')
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    email: 'test@example.com',
    role: 'authenticated',
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'wrong-key' })
    .setSubject('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    .setIssuer(TEST_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(wrongKey)
}

export async function signJwtWithWrongIssuer(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    email: 'test@example.com',
    role: 'authenticated',
  })
    .setProtectedHeader({ alg: 'ES256', kid: TEST_KID })
    .setSubject('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    .setIssuer('https://wrong-project.supabase.co/auth/v1')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)
}
