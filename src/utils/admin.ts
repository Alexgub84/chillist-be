import type { JwtUser } from '../plugins/auth.js'

export function isAdmin(user: JwtUser | null | undefined): boolean {
  return user?.role === 'admin'
}
