import type { PlanForAiContext } from '../plan-context-formatters.js'
import {
  resolveLocationTextForAi,
  normalizeTagsForAi,
  resolveParticipantEstimates,
} from '../plan-context-formatters.js'
import {
  SYSTEM_INSTRUCTION,
  getLanguageInstruction,
  getDietaryInstruction,
  getCategoriesInstruction,
  CONTEXT_GUIDANCE,
  CATEGORY_RULES,
  ITEM_ATOMICITY_RULE,
  ITEM_NAMING_RULE,
  SUBCATEGORY_GUIDANCE,
  VALID_ENUMS,
  getClosingInstruction,
  type SupportedAiLang,
} from './prompt-templates.js'

const MS_PER_DAY = 86_400_000

function computeNightsCount(
  startDate: Date | null,
  endDate: Date | null
): number | undefined {
  if (!startDate || !endDate) return undefined
  const diff = endDate.getTime() - startDate.getTime()
  if (diff < 0) return 0
  return Math.floor(diff / MS_PER_DAY)
}

export function buildItemSuggestionsPrompt(
  plan: PlanForAiContext,
  lang: SupportedAiLang = 'en'
): string {
  const {
    adults,
    kids,
    total: totalParticipants,
  } = resolveParticipantEstimates(plan.estimatedAdults, plan.estimatedKids)

  const location = resolveLocationTextForAi(plan.location)
  const tags = normalizeTagsForAi(plan.tags)
  const nightsCount = computeNightsCount(plan.startDate, plan.endDate)

  const sections: string[] = [
    SYSTEM_INSTRUCTION,
    '',
    getLanguageInstruction(lang),
    '',
    `Plan title: ${plan.title}`,
  ]

  if (nightsCount !== undefined) {
    const label =
      nightsCount === 0
        ? 'Day trip (no overnight stay)'
        : nightsCount === 1
          ? '1 night (overnight stay)'
          : `${nightsCount} nights`
    sections.push(`Trip duration: ${label}.`)
  }

  if (location) {
    sections.push(`Location / destination: ${location}.`)
  }

  if (tags.length > 0) {
    sections.push(`Activity tags: ${tags.join(', ')}.`)
  }

  if (totalParticipants === 0) {
    sections.push(
      'Estimated group size: not specified (0 adults and 0 kids). Infer reasonable quantities.'
    )
  } else {
    sections.push(
      `Estimated group size: ${adults} adult(s), ${kids} kid(s), ${totalParticipants} people total.`
    )
  }

  if (plan.dietarySummary?.trim()) {
    sections.push('', getDietaryInstruction(plan.dietarySummary.trim()))
  }

  const categoryCount = plan.categories
    ? Object.keys(plan.categories).length
    : 3

  if (plan.categories) {
    sections.push('', getCategoriesInstruction(plan.categories))
  }

  sections.push(
    '',
    CONTEXT_GUIDANCE,
    '',
    CATEGORY_RULES,
    '',
    ITEM_ATOMICITY_RULE,
    '',
    ITEM_NAMING_RULE
  )

  // Only inject the canonical subcategory list when the caller did NOT send
  // one. When categories + subcategories are provided (FE path), the
  // getCategoriesInstruction block above already carries the full list —
  // adding a second list would create contradictory guidance.
  if (!plan.categories) {
    sections.push('', SUBCATEGORY_GUIDANCE)
  }

  sections.push('', VALID_ENUMS, '', getClosingInstruction(categoryCount))

  return sections.join('\n')
}
