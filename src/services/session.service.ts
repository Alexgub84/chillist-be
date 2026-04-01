import { eq, isNull, and } from 'drizzle-orm'
import { Database } from '../db/index.js'
import { sessions, type DeviceType } from '../db/schema.js'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value)
}

export function getDeviceType(userAgent: string): DeviceType {
  if (!userAgent) return 'desktop'
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet'
  if (
    /mobile|iphone|android.*mobile|webos|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    )
  )
    return 'mobile'
  return 'desktop'
}

export async function upsertSession(
  db: Database,
  data: {
    id: string
    userId: string | null
    deviceType: DeviceType
    userAgent: string
  }
) {
  await db
    .insert(sessions)
    .values({
      id: data.id,
      userId: data.userId,
      deviceType: data.deviceType,
      userAgent: data.userAgent,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        lastActivityAt: new Date(),
        ...(data.userId && { userId: data.userId }),
      },
    })
}

export async function endSession(db: Database, sessionId: string) {
  await db
    .update(sessions)
    .set({ endedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)))
}
