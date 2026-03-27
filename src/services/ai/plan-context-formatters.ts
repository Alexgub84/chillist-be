import type { Location } from '../../db/schema.js'
import { EQUIPMENT_SUBCATEGORIES, FOOD_SUBCATEGORIES } from './subcategories.js'

const MS_PER_DAY = 86_400_000

export interface PlanAiContext {
  prompt: string
  planTitle: string
  nightsCount?: number
  location?: string
  tags: string[]
  totalParticipants: number
}

export interface PlanForAiContext {
  title: string
  startDate: Date | null
  endDate: Date | null
  location: Location | null | undefined
  tags: string[] | null | undefined
  estimatedAdults: number | null
  estimatedKids: number | null
}

export function formatLocationForAi(location: Location): string {
  const parts = [
    location.name,
    location.city,
    location.region,
    location.country,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  return parts.join(', ')
}

export function resolveLocationTextForAi(
  location: Location | null | undefined
): string | undefined {
  if (!location?.name?.trim()) return undefined
  return formatLocationForAi(location)
}

export function normalizeTagsForAi(
  tags: string[] | null | undefined
): string[] {
  return (tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0)
}

export function resolveParticipantEstimates(
  estimatedAdults: number | null | undefined,
  estimatedKids: number | null | undefined
): { adults: number; kids: number; total: number } {
  const adults = estimatedAdults ?? 0
  const kids = estimatedKids ?? 0
  return { adults, kids, total: adults + kids }
}

function computeNightsCount(
  startDate: Date | null,
  endDate: Date | null
): number | undefined {
  if (!startDate || !endDate) return undefined
  const diff = endDate.getTime() - startDate.getTime()
  if (diff < 0) return 0
  return Math.floor(diff / MS_PER_DAY)
}

function buildPrompt(ctx: {
  planTitle: string
  nightsCount?: number
  location?: string
  tags: string[]
  totalParticipants: number
  adults: number
  kids: number
}): string {
  const lines: string[] = [
    'You are helping plan a shared packing and food checklist for a group trip or event.',
    '',
    `Plan title: ${ctx.planTitle}`,
  ]

  if (ctx.nightsCount !== undefined) {
    const label =
      ctx.nightsCount === 1 ? '1 night' : `${ctx.nightsCount} nights`
    lines.push(`Trip duration: ${label} (from start to end date).`)
  }

  if (ctx.location) {
    lines.push(`Location / destination: ${ctx.location}.`)
  }

  if (ctx.tags.length > 0) {
    lines.push(`Activity tags: ${ctx.tags.join(', ')}.`)
  }

  if (ctx.totalParticipants === 0) {
    lines.push(
      'Estimated group size: not specified (0 adults and 0 kids). Infer reasonable quantities.'
    )
  } else {
    lines.push(
      `Estimated group size: ${ctx.adults} adult(s), ${ctx.kids} kid(s), ${ctx.totalParticipants} people total.`
    )
  }

  lines.push(
    '',
    'Prefer these subcategory labels when assigning items (you may use a new label if nothing fits):',
    '',
    'Equipment subcategories:',
    ...EQUIPMENT_SUBCATEGORIES.map((s) => `- ${s}`),
    '',
    'Food subcategories:',
    ...FOOD_SUBCATEGORIES.map((s) => `- ${s}`),
    '',
    'Suggest practical items for this trip. Each item must use a valid category (group_equipment, personal_equipment, food) and unit from the allowed list.'
  )

  return lines.join('\n')
}

export function buildPlanAiContext(plan: PlanForAiContext): PlanAiContext {
  const {
    adults,
    kids,
    total: totalParticipants,
  } = resolveParticipantEstimates(plan.estimatedAdults, plan.estimatedKids)

  const location = resolveLocationTextForAi(plan.location)
  const tags = normalizeTagsForAi(plan.tags)
  const nightsCount = computeNightsCount(plan.startDate, plan.endDate)

  const prompt = buildPrompt({
    planTitle: plan.title,
    nightsCount,
    location,
    tags,
    totalParticipants,
    adults,
    kids,
  })

  return {
    prompt,
    planTitle: plan.title,
    nightsCount,
    location,
    tags,
    totalParticipants,
  }
}
