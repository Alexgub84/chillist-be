import { eq, desc } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { planTagVersions, planTagOptions } from '../db/schema.js'
import type { TierLabels, CrossGroupRule } from '../db/schema.js'

type Tier1Option = { id: string; label: string; emoji: string }
type Tier2Option = { id: string; label: string }
type Tier3Option = { id: string; label: string }

type Tier2CrossGroupRule = {
  trigger: string
  disable?: string[]
  deselect?: string[]
  disable_tooltip?: string
}

type Tier2Block = {
  options: Tier2Option[]
  mutex_groups: string[][]
  cross_group_rules: Tier2CrossGroupRule[]
}

export type TaxonomyTier1 = {
  label: string
  key: string
  options: Tier1Option[]
}

export type TaxonomyTier2 = {
  label: string
  key: string
  conditional_on: string
  options_by_parent: Record<string, Tier2Block>
}

export type TaxonomyTier3 = {
  label: string
  key: string
  conditional_on: string
  options_by_parent: Record<string, Tier3Option[]>
}

export type TaxonomyResponse = {
  version: string
  description: string | null
  tiers: {
    tier1: TaxonomyTier1
    tier2: TaxonomyTier2
    tier3: TaxonomyTier3
  }
}

type OptionRow = {
  id: string
  tier: number
  parentId: string | null
  label: string
  emoji: string | null
  sortOrder: number
  mutexGroup: string | null
  crossGroupRules: CrossGroupRule[] | null
}

export function assembleTaxonomyResponse(
  version: {
    version: string
    description: string | null
    tierLabels: TierLabels
  },
  options: OptionRow[]
): TaxonomyResponse {
  const tier1Options = options
    .filter((o) => o.tier === 1)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const tier2Options = options
    .filter((o) => o.tier === 2)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const tier3Options = options
    .filter((o) => o.tier === 3)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const tier1: TaxonomyTier1 = {
    label: version.tierLabels.tier1.label,
    key: version.tierLabels.tier1.key,
    options: tier1Options.map((o) => ({
      id: o.id,
      label: o.label,
      emoji: o.emoji ?? '',
    })),
  }

  const tier2ByParent: Record<string, Tier2Block> = {}

  for (const option of tier2Options) {
    const parentId = option.parentId ?? ''
    if (!tier2ByParent[parentId]) {
      tier2ByParent[parentId] = {
        options: [],
        mutex_groups: [],
        cross_group_rules: [],
      }
    }
    tier2ByParent[parentId].options.push({ id: option.id, label: option.label })

    if (option.crossGroupRules && option.crossGroupRules.length > 0) {
      for (const rule of option.crossGroupRules) {
        tier2ByParent[parentId].cross_group_rules.push({
          trigger: option.id,
          ...rule,
        })
      }
    }
  }

  for (const parentId of Object.keys(tier2ByParent)) {
    const optionsUnderParent = tier2Options.filter(
      (o) => o.parentId === parentId
    )
    const mutexGroupMap = new Map<string, string[]>()
    for (const opt of optionsUnderParent) {
      if (opt.mutexGroup) {
        const existing = mutexGroupMap.get(opt.mutexGroup) ?? []
        existing.push(opt.id)
        mutexGroupMap.set(opt.mutexGroup, existing)
      }
    }
    tier2ByParent[parentId].mutex_groups = Array.from(
      mutexGroupMap.values()
    ).filter((g) => g.length > 1)
  }

  const tier2: TaxonomyTier2 = {
    label: version.tierLabels.tier2.label,
    key: version.tierLabels.tier2.key,
    conditional_on: version.tierLabels.tier2.conditional_on,
    options_by_parent: tier2ByParent,
  }

  const tier3ByParent: Record<string, Tier3Option[]> = {}
  for (const option of tier3Options) {
    const parentId = option.parentId ?? ''
    if (!tier3ByParent[parentId]) {
      tier3ByParent[parentId] = []
    }
    tier3ByParent[parentId].push({ id: option.id, label: option.label })
  }

  const tier3: TaxonomyTier3 = {
    label: version.tierLabels.tier3.label,
    key: version.tierLabels.tier3.key,
    conditional_on: version.tierLabels.tier3.conditional_on,
    options_by_parent: tier3ByParent,
  }

  return {
    version: version.version,
    description: version.description,
    tiers: { tier1, tier2, tier3 },
  }
}

export async function getLatestTagTaxonomy(
  db: Database
): Promise<TaxonomyResponse | null> {
  const [latestVersion] = await db
    .select()
    .from(planTagVersions)
    .orderBy(desc(planTagVersions.createdAt))
    .limit(1)

  if (!latestVersion) return null

  const options = await db
    .select()
    .from(planTagOptions)
    .where(eq(planTagOptions.versionId, latestVersion.id))

  if (options.length === 0) return null

  return assembleTaxonomyResponse(latestVersion, options)
}
