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

export async function fetchSupabaseUserMetadata(
  userId: string
): Promise<{ displayName: string } | null> {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return null

  const url = `${config.supabaseUrl}/auth/v1/admin/users/${userId}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      apikey: config.supabaseServiceRoleKey,
    },
  })

  if (!response.ok) return null

  const data = (await response.json()) as SupabaseAdminUser
  const meta = data.user_metadata

  if (!meta) return null

  const { firstName, lastName } = parseNameFromMetadata(meta)
  if (!firstName) return null

  const displayName = lastName ? `${firstName} ${lastName}` : firstName
  return { displayName }
}
