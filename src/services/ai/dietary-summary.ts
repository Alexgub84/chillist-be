import {
  ALLERGY_TYPE_VALUES,
  DIET_TYPE_VALUES,
  type AllergyType,
  type DietType,
  type DietaryMembers,
} from '../../db/schema.js'

export type ParticipantDietaryRow = {
  foodPreferences: string | null
  dietaryMembers: DietaryMembers | null
}

function isDietType(value: string): value is DietType {
  return (DIET_TYPE_VALUES as readonly string[]).includes(value)
}

function parseFoodPreferencesJson(raw: string | null): DietType[] {
  if (!raw?.trim()) return []
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[')) {
    if (isDietType(trimmed)) return [trimmed]
    return []
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) return []
    const diets: DietType[] = []
    for (const entry of parsed) {
      if (entry && typeof entry === 'object' && 'diet' in entry) {
        const d = (entry as { diet: unknown }).diet
        if (typeof d === 'string' && isDietType(d)) diets.push(d)
      }
    }
    return diets
  } catch {
    return []
  }
}

function dietsFromRow(row: ParticipantDietaryRow): DietType[] {
  if (row.dietaryMembers?.members?.length) {
    return row.dietaryMembers.members.map((m) => m.diet)
  }
  return parseFoodPreferencesJson(row.foodPreferences)
}

function allergiesFromRow(row: ParticipantDietaryRow): AllergyType[] {
  if (!row.dietaryMembers?.members?.length) return []
  const out: AllergyType[] = []
  for (const m of row.dietaryMembers.members) {
    for (const a of m.allergies) {
      if (a !== 'none') out.push(a)
    }
  }
  return out
}

function dietPhrase(diet: DietType, count: number): string {
  if (diet === 'everything') {
    return count === 1
      ? '1 person with no dietary restrictions'
      : `${count} people with no dietary restrictions`
  }
  const label = diet.replace(/_/g, ' ')
  return count === 1 ? `1 ${label}` : `${count} ${label}`
}

function allergyPhrase(counts: Map<AllergyType, number>): string | undefined {
  const parts: string[] = []
  for (const a of ALLERGY_TYPE_VALUES) {
    if (a === 'none') continue
    const n = counts.get(a) ?? 0
    if (n > 0) parts.push(`${n}× ${a.replace(/_/g, ' ')}`)
  }
  if (parts.length === 0) return undefined
  return `Allergies to account for: ${parts.join(', ')}.`
}

export function aggregateDietarySummary(
  rows: ParticipantDietaryRow[]
): string | undefined {
  const dietCounts = new Map<DietType, number>()
  const allergyCounts = new Map<AllergyType, number>()

  for (const row of rows) {
    const diets = dietsFromRow(row)
    if (diets.length === 0) continue
    for (const d of diets) {
      dietCounts.set(d, (dietCounts.get(d) ?? 0) + 1)
    }
    for (const a of allergiesFromRow(row)) {
      allergyCounts.set(a, (allergyCounts.get(a) ?? 0) + 1)
    }
  }

  const orderedDiets = [...DIET_TYPE_VALUES].filter(
    (d) => (dietCounts.get(d) ?? 0) > 0
  )
  const dietParts = orderedDiets.map((d) =>
    dietPhrase(d, dietCounts.get(d) ?? 0)
  )
  const allergyLine = allergyPhrase(allergyCounts)

  if (dietParts.length === 0 && !allergyLine) return undefined

  const main = dietParts.join('; ')
  if (!main) return allergyLine
  if (!allergyLine) return main
  return `${main}. ${allergyLine}`
}
