import { eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  participants,
  users,
  Participant,
  DietaryMembers,
} from '../db/schema.js'
import { addParticipantToAllFlaggedItems } from './item.service.js'

export interface AddParticipantData {
  planId: string
  userId: string
  name: string
  lastName: string
  contactPhone: string
  contactEmail?: string | null
  displayName?: string | null
  adultsCount?: number | null
  kidsCount?: number | null
  foodPreferences?: string | null
  allergies?: string | null
  dietaryMembers?: DietaryMembers | null
  notes?: string | null
  role?: 'participant' | 'viewer'
  inviteToken?: string | null
  inviteStatus?: 'pending' | 'invited' | 'accepted'
  rsvpStatus?: 'pending' | 'confirmed' | 'not_sure'
}

export async function addParticipantToPlan(
  db: Database,
  data: AddParticipantData
): Promise<Participant> {
  let foodPreferences = data.foodPreferences ?? null
  let allergies = data.allergies ?? null

  if ((!foodPreferences || !allergies) && data.userId) {
    const [defaults] = await db
      .select()
      .from(users)
      .where(eq(users.userId, data.userId))

    if (defaults) {
      if (!foodPreferences && defaults.foodPreferences) {
        foodPreferences = defaults.foodPreferences
      }
      if (!allergies && defaults.allergies) {
        allergies = defaults.allergies
      }
    }
  }

  const [created] = await db
    .insert(participants)
    .values({
      planId: data.planId,
      userId: data.userId,
      name: data.name,
      lastName: data.lastName,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail ?? null,
      displayName: data.displayName ?? null,
      adultsCount: data.adultsCount ?? null,
      kidsCount: data.kidsCount ?? null,
      foodPreferences,
      allergies,
      dietaryMembers: data.dietaryMembers ?? null,
      notes: data.notes ?? null,
      role: data.role ?? 'participant',
      inviteToken: data.inviteToken ?? null,
      inviteStatus: data.inviteStatus ?? 'pending',
      rsvpStatus: data.rsvpStatus ?? 'confirmed',
    })
    .returning()

  await addParticipantToAllFlaggedItems(db, data.planId, created.participantId)

  return created
}
