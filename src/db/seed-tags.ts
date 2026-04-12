/**
 * Production-safe taxonomy seed script.
 * Inserts plan tag taxonomy rows without touching any other tables.
 * Idempotent: skips gracefully if the version already exists.
 *
 * Usage:
 *   Local:  npm run db:seed:tags
 *   Prod:   npm run db:seed:tags:prod
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  planTagVersions,
  planTagOptions,
  type TierLabels,
  type CrossGroupRule,
} from './schema.js'

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf-8')
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
}

loadEnvLocal()

const connectionString =
  process.env.DATABASE_URL_PUBLIC ?? process.env.DATABASE_URL

if (!connectionString) {
  console.error(
    'DATABASE_URL_PUBLIC or DATABASE_URL environment variable is required'
  )
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

const TAG_VERSION = '1.2'

async function seedTags() {
  console.log(`Seeding plan tag taxonomy v${TAG_VERSION}...`)

  try {
    const existing = await db
      .select()
      .from(planTagVersions)
      .where(eq(planTagVersions.version, TAG_VERSION))
      .limit(1)

    if (existing.length > 0) {
      console.log(`Version ${TAG_VERSION} already exists — nothing to do.`)
      return
    }

    const tierLabels: TierLabels = {
      tier1: { label: 'What kind of trip is this?', key: 'plan_type' },
      tier2: {
        label: 'Tell us a bit more',
        key: 'logistics',
        conditional_on: 'tier1',
      },
      tier3: {
        label: 'A few more details',
        key: 'specifics',
        conditional_on: 'tier2',
      },
    }

    const [tagVersion] = await db
      .insert(planTagVersions)
      .values({
        version: TAG_VERSION,
        description:
          'Three-tier conditional tag system for Chillist plan creation wizard. Tier 2 uses mutex_groups for mutually exclusive selections within a concern (stay, food, vibe) and cross_group_rules for dependent deselection/disabling. Duration/day-count questions removed (handled by date picker).',
        tierLabels,
      })
      .returning()

    const vId = tagVersion.id

    type OptionSeed = {
      id: string
      versionId: string
      tier: number
      parentId: string | null
      label: string
      emoji?: string | null
      sortOrder: number
      mutexGroup?: string | null
      crossGroupRules?: CrossGroupRule[] | null
    }

    const tagOptions: OptionSeed[] = [
      // ── Tier 1 ──
      {
        id: 'camping',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Camping',
        emoji: '⛺',
        sortOrder: 0,
      },
      {
        id: 'hotel_trip',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Hotel Stay',
        emoji: '🏨',
        sortOrder: 1,
      },
      {
        id: 'road_trip',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Road Trip',
        emoji: '🚗',
        sortOrder: 2,
      },
      {
        id: 'day_trip',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Day Trip',
        emoji: '🌅',
        sortOrder: 3,
      },
      {
        id: 'beach',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Beach',
        emoji: '🏖️',
        sortOrder: 4,
      },
      {
        id: 'city_break',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'City Break',
        emoji: '🏙️',
        sortOrder: 5,
      },
      {
        id: 'hiking',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Hiking / Trekking',
        emoji: '🥾',
        sortOrder: 6,
      },
      {
        id: 'festival',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Festival / Event',
        emoji: '🎪',
        sortOrder: 7,
      },
      {
        id: 'dinner_party',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Dinner / Party',
        emoji: '🍽️',
        sortOrder: 8,
      },
      {
        id: 'other',
        versionId: vId,
        tier: 1,
        parentId: null,
        label: 'Other',
        emoji: '✨',
        sortOrder: 9,
      },

      // ── Tier 2: camping ──
      {
        id: 'camping_cooking',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: "We're cooking our own food",
        sortOrder: 0,
        mutexGroup: 'food',
      },
      {
        id: 'camping_mixed_food',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: 'Mix of cooking and eating out',
        sortOrder: 1,
        mutexGroup: 'food',
      },
      {
        id: 'camping_tent',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: 'Sleeping in tents',
        sortOrder: 2,
        mutexGroup: 'sleep',
      },
      {
        id: 'camping_cabin',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: 'Sleeping in cabins / glamping',
        sortOrder: 3,
        mutexGroup: 'sleep',
      },
      {
        id: 'camping_caravan',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: 'Caravan / campervan',
        sortOrder: 4,
        mutexGroup: 'sleep',
      },
      {
        id: 'camping_organized',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: 'Organized campsite',
        sortOrder: 5,
        mutexGroup: 'site',
      },
      {
        id: 'camping_wild',
        versionId: vId,
        tier: 2,
        parentId: 'camping',
        label: 'Wild / off-grid camping',
        sortOrder: 6,
        mutexGroup: 'site',
      },

      // ── Tier 2: hotel_trip ──
      {
        id: 'hotel_hotel',
        versionId: vId,
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Hotel',
        sortOrder: 0,
        mutexGroup: 'stay',
      },
      {
        id: 'hotel_apartment',
        versionId: vId,
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Airbnb / apartment',
        sortOrder: 1,
        mutexGroup: 'stay',
        crossGroupRules: [
          {
            disable: ['hotel_hotel_meals'],
            disable_tooltip:
              'Hotel meals only available when staying in a hotel',
          },
        ],
      },
      {
        id: 'hotel_hotel_meals',
        versionId: vId,
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Eating at the hotel',
        sortOrder: 2,
        mutexGroup: 'food',
        crossGroupRules: [
          {
            disable: ['hotel_cook'],
            disable_tooltip: 'Not relevant when hotel provides meals',
          },
        ],
      },
      {
        id: 'hotel_restaurants',
        versionId: vId,
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Restaurants / eating out',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'hotel_cook',
        versionId: vId,
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Cooking ourselves',
        sortOrder: 4,
        mutexGroup: 'food',
      },
      {
        id: 'hotel_meals_mixed',
        versionId: vId,
        tier: 2,
        parentId: 'hotel_trip',
        label: 'Mix of eating in and out',
        sortOrder: 5,
        mutexGroup: 'food',
      },

      // ── Tier 2: road_trip ──
      {
        id: 'road_hotels',
        versionId: vId,
        tier: 2,
        parentId: 'road_trip',
        label: 'Staying in hotels along the way',
        sortOrder: 0,
        mutexGroup: 'stay',
      },
      {
        id: 'road_camping',
        versionId: vId,
        tier: 2,
        parentId: 'road_trip',
        label: 'Camping along the way',
        sortOrder: 1,
        mutexGroup: 'stay',
      },
      {
        id: 'road_mixed_stay',
        versionId: vId,
        tier: 2,
        parentId: 'road_trip',
        label: 'Mix of accommodation',
        sortOrder: 2,
        mutexGroup: 'stay',
      },
      {
        id: 'road_eating_out',
        versionId: vId,
        tier: 2,
        parentId: 'road_trip',
        label: 'Eating out / restaurants',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'road_cooking',
        versionId: vId,
        tier: 2,
        parentId: 'road_trip',
        label: 'Cooking our own food',
        sortOrder: 4,
        mutexGroup: 'food',
      },
      {
        id: 'road_mixed_food',
        versionId: vId,
        tier: 2,
        parentId: 'road_trip',
        label: 'Mix of eating in and out',
        sortOrder: 5,
        mutexGroup: 'food',
      },

      // ── Tier 2: day_trip ──
      {
        id: 'day_nature',
        versionId: vId,
        tier: 2,
        parentId: 'day_trip',
        label: 'Nature / outdoors',
        sortOrder: 0,
      },
      {
        id: 'day_city',
        versionId: vId,
        tier: 2,
        parentId: 'day_trip',
        label: 'City / sightseeing',
        sortOrder: 1,
      },
      {
        id: 'day_activity',
        versionId: vId,
        tier: 2,
        parentId: 'day_trip',
        label: 'Specific activity (kayaking, cycling, etc.)',
        sortOrder: 2,
      },
      {
        id: 'day_venue',
        versionId: vId,
        tier: 2,
        parentId: 'day_trip',
        label: 'Specific venue (winery, museum, zoo, etc.)',
        sortOrder: 3,
      },
      {
        id: 'day_packed_lunch',
        versionId: vId,
        tier: 2,
        parentId: 'day_trip',
        label: 'Bringing packed lunch',
        sortOrder: 4,
        mutexGroup: 'food',
      },
      {
        id: 'day_eating_out',
        versionId: vId,
        tier: 2,
        parentId: 'day_trip',
        label: 'Eating out',
        sortOrder: 5,
        mutexGroup: 'food',
      },

      // ── Tier 2: beach ──
      {
        id: 'beach_hotel',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'Staying in a hotel / resort',
        sortOrder: 0,
        mutexGroup: 'stay',
      },
      {
        id: 'beach_camping',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'Beach camping',
        sortOrder: 1,
        mutexGroup: 'stay',
      },
      {
        id: 'beach_cooking',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'Bringing / cooking food',
        sortOrder: 2,
        mutexGroup: 'food',
      },
      {
        id: 'beach_eating_out',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'Eating out',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'beach_relaxing',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'Relaxing / sunbathing',
        sortOrder: 4,
        mutexGroup: 'activity',
      },
      {
        id: 'beach_active',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'Active (water sports, volleyball, etc.)',
        sortOrder: 5,
        mutexGroup: 'activity',
      },
      {
        id: 'beach_kids',
        versionId: vId,
        tier: 2,
        parentId: 'beach',
        label: 'With young kids',
        sortOrder: 6,
      },

      // ── Tier 2: city_break ──
      {
        id: 'city_hotel',
        versionId: vId,
        tier: 2,
        parentId: 'city_break',
        label: 'Hotel',
        sortOrder: 0,
        mutexGroup: 'stay',
      },
      {
        id: 'city_airbnb',
        versionId: vId,
        tier: 2,
        parentId: 'city_break',
        label: 'Airbnb / apartment',
        sortOrder: 1,
        mutexGroup: 'stay',
      },
      {
        id: 'city_eating_out',
        versionId: vId,
        tier: 2,
        parentId: 'city_break',
        label: 'Eating out for most meals',
        sortOrder: 2,
        mutexGroup: 'food',
      },
      {
        id: 'city_mixed_food',
        versionId: vId,
        tier: 2,
        parentId: 'city_break',
        label: 'Mix of cooking and eating out',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'city_activities',
        versionId: vId,
        tier: 2,
        parentId: 'city_break',
        label: 'Focused on activities / sightseeing',
        sortOrder: 4,
      },
      {
        id: 'city_nightlife',
        versionId: vId,
        tier: 2,
        parentId: 'city_break',
        label: 'Nightlife / bars / clubs',
        sortOrder: 5,
      },

      // ── Tier 2: hiking ──
      {
        id: 'hiking_hut',
        versionId: vId,
        tier: 2,
        parentId: 'hiking',
        label: 'Staying in mountain huts',
        sortOrder: 0,
        mutexGroup: 'sleep',
      },
      {
        id: 'hiking_tent',
        versionId: vId,
        tier: 2,
        parentId: 'hiking',
        label: 'Tent camping',
        sortOrder: 1,
        mutexGroup: 'sleep',
      },
      {
        id: 'hiking_packed_food',
        versionId: vId,
        tier: 2,
        parentId: 'hiking',
        label: 'Bringing all food',
        sortOrder: 2,
        mutexGroup: 'food',
      },
      {
        id: 'hiking_mixed_food',
        versionId: vId,
        tier: 2,
        parentId: 'hiking',
        label: 'Mix of packed and buying along the way',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'hiking_guided',
        versionId: vId,
        tier: 2,
        parentId: 'hiking',
        label: 'Guided / organized group',
        sortOrder: 4,
      },

      // ── Tier 2: festival ──
      {
        id: 'festival_camping',
        versionId: vId,
        tier: 2,
        parentId: 'festival',
        label: 'Camping at the festival',
        sortOrder: 0,
        mutexGroup: 'stay',
      },
      {
        id: 'festival_hotel',
        versionId: vId,
        tier: 2,
        parentId: 'festival',
        label: 'Staying nearby in a hotel',
        sortOrder: 1,
        mutexGroup: 'stay',
      },
      {
        id: 'festival_day_only',
        versionId: vId,
        tier: 2,
        parentId: 'festival',
        label: 'Day visits only',
        sortOrder: 2,
        mutexGroup: 'stay',
      },
      {
        id: 'festival_food_there',
        versionId: vId,
        tier: 2,
        parentId: 'festival',
        label: 'Eating at the festival',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'festival_packed_food',
        versionId: vId,
        tier: 2,
        parentId: 'festival',
        label: 'Bringing our own food',
        sortOrder: 4,
        mutexGroup: 'food',
      },

      // ── Tier 2: dinner_party ──
      {
        id: 'dinner_restaurant',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: 'Restaurant / venue',
        sortOrder: 0,
        mutexGroup: 'venue',
        crossGroupRules: [
          {
            disable: ['dinner_potluck'],
            disable_tooltip: "Potluck isn't available at a restaurant",
          },
        ],
      },
      {
        id: 'dinner_home',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: "Someone's home",
        sortOrder: 1,
        mutexGroup: 'venue',
      },
      {
        id: 'dinner_potluck',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: 'Potluck / each brings something',
        sortOrder: 2,
        mutexGroup: 'catering',
      },
      {
        id: 'dinner_catered',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: 'Catered',
        sortOrder: 3,
        mutexGroup: 'catering',
      },
      {
        id: 'dinner_bbq',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: 'BBQ / outdoor',
        sortOrder: 4,
        mutexGroup: 'venue',
      },
      {
        id: 'dinner_drinks_only',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: 'Drinks / no food focus',
        sortOrder: 5,
        crossGroupRules: [
          {
            disable: ['dinner_potluck', 'dinner_catered'],
            disable_tooltip: 'No food logistics when drinks-only',
          },
        ],
      },
      {
        id: 'dinner_games_gathering',
        versionId: vId,
        tier: 2,
        parentId: 'dinner_party',
        label: 'Games night / gathering',
        sortOrder: 6,
      },

      // ── Tier 2: other ──
      {
        id: 'other_indoor',
        versionId: vId,
        tier: 2,
        parentId: 'other',
        label: 'Indoor activity',
        sortOrder: 0,
        mutexGroup: 'setting',
      },
      {
        id: 'other_outdoor',
        versionId: vId,
        tier: 2,
        parentId: 'other',
        label: 'Outdoor activity',
        sortOrder: 1,
        mutexGroup: 'setting',
      },
      {
        id: 'other_mixed',
        versionId: vId,
        tier: 2,
        parentId: 'other',
        label: 'Mix of indoor and outdoor',
        sortOrder: 2,
        mutexGroup: 'setting',
      },
      {
        id: 'other_food_included',
        versionId: vId,
        tier: 2,
        parentId: 'other',
        label: 'Food / drinks included',
        sortOrder: 3,
        mutexGroup: 'food',
      },
      {
        id: 'other_food_self',
        versionId: vId,
        tier: 2,
        parentId: 'other',
        label: 'Everyone sorts their own food',
        sortOrder: 4,
        mutexGroup: 'food',
      },

      // ── Tier 3: camping_cooking ──
      {
        id: 'cooking_shared_meals',
        versionId: vId,
        tier: 3,
        parentId: 'camping_cooking',
        label: 'Shared group meals',
        sortOrder: 0,
      },
      {
        id: 'cooking_each_own',
        versionId: vId,
        tier: 3,
        parentId: 'camping_cooking',
        label: 'Everyone cooks their own',
        sortOrder: 1,
      },
      {
        id: 'cooking_assigned',
        versionId: vId,
        tier: 3,
        parentId: 'camping_cooking',
        label: 'Assigned cooking duties per day',
        sortOrder: 2,
      },

      // ── Tier 3: camping_mixed_food ──
      {
        id: 'mixed_food_shared_cook',
        versionId: vId,
        tier: 3,
        parentId: 'camping_mixed_food',
        label: 'Some meals shared, some eating out',
        sortOrder: 0,
      },
      {
        id: 'mixed_food_each_own',
        versionId: vId,
        tier: 3,
        parentId: 'camping_mixed_food',
        label: 'Each person handles their own',
        sortOrder: 1,
      },

      // ── Tier 3: camping_tent ──
      {
        id: 'tent_shared',
        versionId: vId,
        tier: 3,
        parentId: 'camping_tent',
        label: 'Sharing tents',
        sortOrder: 0,
      },
      {
        id: 'tent_own',
        versionId: vId,
        tier: 3,
        parentId: 'camping_tent',
        label: 'Everyone brings their own tent',
        sortOrder: 1,
      },
      {
        id: 'tent_renting',
        versionId: vId,
        tier: 3,
        parentId: 'camping_tent',
        label: 'Renting tents on-site',
        sortOrder: 2,
      },

      // ── Tier 3: camping_cabin ──
      {
        id: 'cabin_full_kitchen',
        versionId: vId,
        tier: 3,
        parentId: 'camping_cabin',
        label: 'Fully equipped kitchen',
        sortOrder: 0,
      },
      {
        id: 'cabin_basic',
        versionId: vId,
        tier: 3,
        parentId: 'camping_cabin',
        label: 'Basic facilities only',
        sortOrder: 1,
      },
      {
        id: 'cabin_no_kitchen',
        versionId: vId,
        tier: 3,
        parentId: 'camping_cabin',
        label: 'No kitchen, eating out',
        sortOrder: 2,
      },

      // ── Tier 3: camping_caravan ──
      {
        id: 'caravan_cooking',
        versionId: vId,
        tier: 3,
        parentId: 'camping_caravan',
        label: 'Cooking in the caravan',
        sortOrder: 0,
      },
      {
        id: 'caravan_mixed',
        versionId: vId,
        tier: 3,
        parentId: 'camping_caravan',
        label: 'Mix of caravan and eating out',
        sortOrder: 1,
      },
      {
        id: 'caravan_eating_out',
        versionId: vId,
        tier: 3,
        parentId: 'camping_caravan',
        label: 'Eating out mostly',
        sortOrder: 2,
      },

      // ── Tier 3: camping_organized ──
      {
        id: 'organized_site_equipment',
        versionId: vId,
        tier: 3,
        parentId: 'camping_organized',
        label: 'Site provides equipment (tent, bedding)',
        sortOrder: 0,
      },
      {
        id: 'organized_own_equipment',
        versionId: vId,
        tier: 3,
        parentId: 'camping_organized',
        label: 'Bring your own equipment',
        sortOrder: 1,
      },
      {
        id: 'organized_communal_kitchen',
        versionId: vId,
        tier: 3,
        parentId: 'camping_organized',
        label: 'Site has a communal kitchen',
        sortOrder: 2,
      },

      // ── Tier 3: camping_wild ──
      {
        id: 'wild_hiking_in',
        versionId: vId,
        tier: 3,
        parentId: 'camping_wild',
        label: 'Hiking in to the spot',
        sortOrder: 0,
      },
      {
        id: 'wild_drive_in',
        versionId: vId,
        tier: 3,
        parentId: 'camping_wild',
        label: 'Driving to the spot',
        sortOrder: 1,
      },
      {
        id: 'wild_water_source',
        versionId: vId,
        tier: 3,
        parentId: 'camping_wild',
        label: 'Need to plan water supply',
        sortOrder: 2,
      },

      // ── Tier 3: hotel_hotel_meals ──
      {
        id: 'hotel_meals_all_inclusive',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_hotel_meals',
        label: 'All-inclusive (all meals)',
        sortOrder: 0,
      },
      {
        id: 'hotel_meals_half_board',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_hotel_meals',
        label: 'Half board (breakfast + dinner)',
        sortOrder: 1,
      },
      {
        id: 'hotel_meals_bb',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_hotel_meals',
        label: 'Breakfast only',
        sortOrder: 2,
      },

      // ── Tier 3: hotel_cook ──
      {
        id: 'hotel_cook_shared',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_cook',
        label: 'Group cooking together',
        sortOrder: 0,
      },
      {
        id: 'hotel_cook_individual',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_cook',
        label: 'Everyone cooks their own',
        sortOrder: 1,
      },

      // ── Tier 3: hotel_apartment ──
      {
        id: 'hotel_apt_full_kitchen',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_apartment',
        label: 'Fully equipped kitchen',
        sortOrder: 0,
      },
      {
        id: 'hotel_apt_basic',
        versionId: vId,
        tier: 3,
        parentId: 'hotel_apartment',
        label: 'Basic facilities only',
        sortOrder: 1,
      },

      // ── Tier 3: road_hotels ──
      {
        id: 'road_hotel_prebooked',
        versionId: vId,
        tier: 3,
        parentId: 'road_hotels',
        label: 'Pre-booked stops',
        sortOrder: 0,
      },
      {
        id: 'road_hotel_flexible',
        versionId: vId,
        tier: 3,
        parentId: 'road_hotels',
        label: 'Finding places as we go',
        sortOrder: 1,
      },

      // ── Tier 3: road_camping ──
      {
        id: 'road_camp_sites',
        versionId: vId,
        tier: 3,
        parentId: 'road_camping',
        label: 'Using established campsites',
        sortOrder: 0,
      },
      {
        id: 'road_camp_wild',
        versionId: vId,
        tier: 3,
        parentId: 'road_camping',
        label: 'Wild camping',
        sortOrder: 1,
      },

      // ── Tier 3: road_mixed_stay ──
      {
        id: 'road_mixed_hotels_camping',
        versionId: vId,
        tier: 3,
        parentId: 'road_mixed_stay',
        label: 'Hotels and camping',
        sortOrder: 0,
      },
      {
        id: 'road_mixed_hotels_airbnb',
        versionId: vId,
        tier: 3,
        parentId: 'road_mixed_stay',
        label: 'Hotels and Airbnbs',
        sortOrder: 1,
      },
      {
        id: 'road_mixed_all_three',
        versionId: vId,
        tier: 3,
        parentId: 'road_mixed_stay',
        label: 'All three',
        sortOrder: 2,
      },

      // ── Tier 3: road_cooking ──
      {
        id: 'road_cook_shared',
        versionId: vId,
        tier: 3,
        parentId: 'road_cooking',
        label: 'Shared group cooking',
        sortOrder: 0,
      },
      {
        id: 'road_cook_own',
        versionId: vId,
        tier: 3,
        parentId: 'road_cooking',
        label: 'Individual cooking',
        sortOrder: 1,
      },

      // ── Tier 3: day_activity ──
      {
        id: 'activity_equipment_needed',
        versionId: vId,
        tier: 3,
        parentId: 'day_activity',
        label: 'Requires special equipment',
        sortOrder: 0,
      },
      {
        id: 'activity_equipment_rental',
        versionId: vId,
        tier: 3,
        parentId: 'day_activity',
        label: 'Equipment can be rented there',
        sortOrder: 1,
      },
      {
        id: 'activity_booking_needed',
        versionId: vId,
        tier: 3,
        parentId: 'day_activity',
        label: 'Needs advance booking',
        sortOrder: 2,
      },

      // ── Tier 3: beach_cooking ──
      {
        id: 'beach_cook_bbq',
        versionId: vId,
        tier: 3,
        parentId: 'beach_cooking',
        label: 'BBQ / grill on the beach',
        sortOrder: 0,
      },
      {
        id: 'beach_cook_packed',
        versionId: vId,
        tier: 3,
        parentId: 'beach_cooking',
        label: 'Packed food, no cooking',
        sortOrder: 1,
      },
      {
        id: 'beach_cook_camp_kitchen',
        versionId: vId,
        tier: 3,
        parentId: 'beach_cooking',
        label: 'Full camp kitchen setup',
        sortOrder: 2,
      },

      // ── Tier 3: city_airbnb ──
      {
        id: 'city_airbnb_cooking',
        versionId: vId,
        tier: 3,
        parentId: 'city_airbnb',
        label: 'Yes, cooking some meals',
        sortOrder: 0,
      },
      {
        id: 'city_airbnb_sleeping_only',
        versionId: vId,
        tier: 3,
        parentId: 'city_airbnb',
        label: 'No, just for sleeping',
        sortOrder: 1,
      },

      // ── Tier 3: city_mixed_food ──
      {
        id: 'city_mixed_airbnb_kitchen',
        versionId: vId,
        tier: 3,
        parentId: 'city_mixed_food',
        label: 'Airbnb kitchen',
        sortOrder: 0,
      },
      {
        id: 'city_mixed_picnic',
        versionId: vId,
        tier: 3,
        parentId: 'city_mixed_food',
        label: 'Picnic / packed food',
        sortOrder: 1,
      },

      // ── Tier 3: city_activities ──
      {
        id: 'city_activities_booked',
        versionId: vId,
        tier: 3,
        parentId: 'city_activities',
        label: 'Already booked',
        sortOrder: 0,
      },
      {
        id: 'city_activities_planning',
        versionId: vId,
        tier: 3,
        parentId: 'city_activities',
        label: 'Need to plan and book',
        sortOrder: 1,
      },
      {
        id: 'city_activities_spontaneous',
        versionId: vId,
        tier: 3,
        parentId: 'city_activities',
        label: 'Spontaneous, deciding there',
        sortOrder: 2,
      },

      // ── Tier 3: city_nightlife ──
      {
        id: 'nightlife_bars',
        versionId: vId,
        tier: 3,
        parentId: 'city_nightlife',
        label: 'Bars / pub crawl',
        sortOrder: 0,
      },
      {
        id: 'nightlife_clubs',
        versionId: vId,
        tier: 3,
        parentId: 'city_nightlife',
        label: 'Clubs / dancing',
        sortOrder: 1,
      },
      {
        id: 'nightlife_mixed',
        versionId: vId,
        tier: 3,
        parentId: 'city_nightlife',
        label: 'Mix of both',
        sortOrder: 2,
      },

      // ── Tier 3: hiking_packed_food ──
      {
        id: 'packed_shared_supplies',
        versionId: vId,
        tier: 3,
        parentId: 'hiking_packed_food',
        label: 'Shared group food supplies',
        sortOrder: 0,
      },
      {
        id: 'packed_each_own',
        versionId: vId,
        tier: 3,
        parentId: 'hiking_packed_food',
        label: 'Each person packs their own',
        sortOrder: 1,
      },

      // ── Tier 3: festival_camping ──
      {
        id: 'fest_camp_shared',
        versionId: vId,
        tier: 3,
        parentId: 'festival_camping',
        label: 'Shared campsite / pitching together',
        sortOrder: 0,
      },
      {
        id: 'fest_camp_own',
        versionId: vId,
        tier: 3,
        parentId: 'festival_camping',
        label: 'Everyone gets their own spot',
        sortOrder: 1,
      },
      {
        id: 'fest_camp_glamping',
        versionId: vId,
        tier: 3,
        parentId: 'festival_camping',
        label: 'Glamping option',
        sortOrder: 2,
      },

      // ── Tier 3: festival_hotel ──
      {
        id: 'fest_hotel_walking',
        versionId: vId,
        tier: 3,
        parentId: 'festival_hotel',
        label: 'Walking distance',
        sortOrder: 0,
      },
      {
        id: 'fest_hotel_transport',
        versionId: vId,
        tier: 3,
        parentId: 'festival_hotel',
        label: 'Need transport each day',
        sortOrder: 1,
      },

      // ── Tier 3: festival_day_only ──
      {
        id: 'fest_day_driving',
        versionId: vId,
        tier: 3,
        parentId: 'festival_day_only',
        label: 'Driving each day',
        sortOrder: 0,
      },
      {
        id: 'fest_day_public_transport',
        versionId: vId,
        tier: 3,
        parentId: 'festival_day_only',
        label: 'Public transport',
        sortOrder: 1,
      },
      {
        id: 'fest_day_shuttle',
        versionId: vId,
        tier: 3,
        parentId: 'festival_day_only',
        label: 'Organized shuttle',
        sortOrder: 2,
      },

      // ── Tier 3: festival_packed_food ──
      {
        id: 'fest_packed_cooler',
        versionId: vId,
        tier: 3,
        parentId: 'festival_packed_food',
        label: 'Full cooler / picnic setup',
        sortOrder: 0,
      },
      {
        id: 'fest_packed_light',
        versionId: vId,
        tier: 3,
        parentId: 'festival_packed_food',
        label: 'Light snacks only',
        sortOrder: 1,
      },
      {
        id: 'fest_packed_dietary',
        versionId: vId,
        tier: 3,
        parentId: 'festival_packed_food',
        label: 'Dietary restrictions to plan around',
        sortOrder: 2,
      },

      // ── Tier 3: dinner_potluck ──
      {
        id: 'potluck_assigned',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_potluck',
        label: 'Assigned dishes per person',
        sortOrder: 0,
      },
      {
        id: 'potluck_free',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_potluck',
        label: 'Everyone brings what they want',
        sortOrder: 1,
      },

      // ── Tier 3: dinner_home ──
      {
        id: 'home_host_cooks',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_home',
        label: 'Host cooks everything',
        sortOrder: 0,
      },
      {
        id: 'home_potluck',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_home',
        label: 'Everyone brings something',
        sortOrder: 1,
      },
      {
        id: 'home_hired_chef',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_home',
        label: 'Hired chef / catering',
        sortOrder: 2,
      },

      // ── Tier 3: dinner_bbq ──
      {
        id: 'bbq_shared_food',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_bbq',
        label: 'Shared group food',
        sortOrder: 0,
      },
      {
        id: 'bbq_bring_own',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_bbq',
        label: 'Everyone brings their own meat/food',
        sortOrder: 1,
      },
      {
        id: 'bbq_assigned',
        versionId: vId,
        tier: 3,
        parentId: 'dinner_bbq',
        label: 'Assigned items per person',
        sortOrder: 2,
      },
    ]

    await db.insert(planTagOptions).values(tagOptions)

    const t1 = tagOptions.filter((o) => o.tier === 1).length
    const t2 = tagOptions.filter((o) => o.tier === 2).length
    const t3 = tagOptions.filter((o) => o.tier === 3).length
    console.log(`Inserted taxonomy v${TAG_VERSION}:`)
    console.log(`  ${t1} tier-1 options`)
    console.log(`  ${t2} tier-2 options`)
    console.log(`  ${t3} tier-3 options`)
    console.log('Done.')
  } catch (error) {
    console.error('Tag seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seedTags()
