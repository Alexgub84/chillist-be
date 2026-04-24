import type { DietaryMembers } from '../db/schema.js'

export class DietaryMembersValidationError extends Error {
  status = 400
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function assertDietaryMembersValid(
  dm: DietaryMembers | null | undefined
): void {
  if (!dm) return
  for (const m of dm.members) {
    if (m.diets.includes('everything') && m.diets.length > 1) {
      throw new DietaryMembersValidationError(
        'dietary_member_everything_must_be_exclusive',
        '"everything" cannot be combined with any other diet tag.'
      )
    }
  }
}
