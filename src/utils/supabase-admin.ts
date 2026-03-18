import { config } from '../config.js'
import { parseNameFromMetadata } from './name.js'

interface SupabaseAdminUser {
  user_metadata?: {
    first_name?: string
    last_name?: string
    full_name?: string
    name?: string
  }
}

interface MinimalLogger {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
}

export async function fetchSupabaseUserMetadata(
  userId: string,
  log?: MinimalLogger
): Promise<{ displayName: string } | null> {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    log?.warn({ userId }, 'Supabase config missing — skipping metadata fetch')
    return null
  }

  const url = `${config.supabaseUrl}/auth/v1/admin/users/${userId}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      apikey: config.supabaseServiceRoleKey,
    },
  })

  if (!response.ok) {
    log?.warn(
      { userId, status: response.status },
      'Supabase metadata fetch failed'
    )
    return null
  }

  const data = (await response.json()) as SupabaseAdminUser
  const meta = data.user_metadata

  if (!meta) {
    log?.warn({ userId }, 'Supabase user has no user_metadata')
    return null
  }

  const { firstName, lastName } = parseNameFromMetadata(meta)
  if (!firstName) {
    log?.warn({ userId }, 'Supabase metadata has no parseable first name')
    return null
  }

  const displayName = lastName ? `${firstName} ${lastName}` : firstName
  log?.info({ userId }, 'Supabase displayName resolved')
  return { displayName }
}
