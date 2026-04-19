import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  plans,
  participants,
  items,
  participantExpenses,
  participantJoinRequests,
  aiUsageLogs,
  aiSuggestions,
  chatbotAiUsage,
  type Location,
  type Assignment,
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

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

/** Local date N days from today at HH:MM — keeps seed plans in the “upcoming” bucket on the FE plans list. */
function dateDaysFromNow(
  daysFromNow: number,
  hours: number,
  minutes = 0
): Date {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hours, minutes, 0, 0)
  d.setSeconds(0, 0)
  return d
}

const connectionString = process.env.DATABASE_URL
const seedOwnerUserId = process.env.SEED_OWNER_USER_ID ?? null

/** When set (e.g. in `.env.local`), Negev plan keeps this id across `db:seed` so local FE bookmarks stay valid. */
const seedNegevPlanId = process.env.SEED_NEGEV_PLAN_ID ?? null

if (!connectionString) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

async function seed() {
  console.log('Seeding database...')

  try {
    await db.execute(
      sql`TRUNCATE plans, participants, items, ai_suggestions, plan_invites, participant_join_requests, participant_expenses, guest_profiles, users, whatsapp_notifications, ai_usage_logs, chatbot_ai_usage CASCADE`
    )
    console.log('Cleared all tables')

    const negevLocation: Location = {
      locationId: crypto.randomUUID(),
      name: 'Negev Desert',
      country: 'Israel',
      region: 'Southern District',
      city: 'Mitzpe Ramon',
      latitude: 30.6103,
      longitude: 34.8015,
      timezone: 'Asia/Jerusalem',
    }

    const [negevPlan] = await db
      .insert(plans)
      .values({
        ...(seedNegevPlanId ? { planId: seedNegevPlanId } : {}),
        title: 'Desert Camping — Negev Family Trip',
        description:
          '5 adults and 5 toddlers camping in the Negev desert. ' +
          'Kid-friendly activities, short hikes, and stargazing. ' +
          'Extra shade structures and water supply are essential for the little ones.',
        status: 'active',
        visibility: 'public',
        location: negevLocation,
        startDate: dateDaysFromNow(14, 8, 0),
        endDate: dateDaysFromNow(15, 16, 0),
        tags: ['camping', 'camping_cooking', 'camping_tent', 'camping_wild'],
        defaultLang: 'he',
        currency: 'ILS',
        estimatedAdults: 7,
        estimatedKids: 5,
        itemQuantitySource: 'estimated',
        aiGenerationCount: 0,
        ...(seedOwnerUserId && { createdByUserId: seedOwnerUserId }),
      })
      .returning()

    console.log('Created plan:', negevPlan.planId)
    if (seedNegevPlanId) {
      console.log('  (SEED_NEGEV_PLAN_ID — stable URL for local FE bookmarks)')
    }
    console.log(
      '  FE (Vite): http://localhost:5173/plans/' +
        negevPlan.planId +
        '  ← full seed item list'
    )
    if (seedOwnerUserId) {
      console.log('Seed owner linked to Supabase user:', seedOwnerUserId)
    }

    const [negevOwner] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Alex',
        lastName: 'Guberman',
        contactPhone: '+9720546340926',
        displayName: 'Alex G.',
        role: 'owner',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alexgub',
        contactEmail: 'dan@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'accepted',
        rsvpStatus: 'confirmed',
        adultsCount: 2,
        kidsCount: 3,
        ...(seedOwnerUserId && { userId: seedOwnerUserId }),
      })
      .returning()

    await db
      .update(plans)
      .set({ ownerParticipantId: negevOwner.participantId })
      .where(eq(plans.planId, negevPlan.planId))

    const [negevP1] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Yael',
        lastName: 'Cohen',
        contactPhone: '+972522223333',
        displayName: 'Yael C.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yael',
        contactEmail: 'yael@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'accepted',
        rsvpStatus: 'confirmed',
        foodPreferences: 'vegetarian',
        allergies: 'nuts',
        adultsCount: 2,
        kidsCount: 1,
      })
      .returning()

    const [negevP2] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Omer',
        lastName: 'Ben-David',
        contactPhone: '+972543334444',
        displayName: 'Omer B.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=omer',
        contactEmail: 'omer@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'invited',
        rsvpStatus: 'confirmed',
      })
      .returning()

    const [negevP3] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Noa',
        lastName: 'Shapira',
        contactPhone: '+972534445555',
        displayName: 'Noa S.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=noa',
        contactEmail: 'noa@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'invited',
        foodPreferences: 'kosher',
        allergies: null,
        adultsCount: 1,
        kidsCount: 2,
      })
      .returning()

    const [negevP4] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Eitan',
        lastName: 'Mizrahi',
        contactPhone: '+972585556666',
        displayName: 'Eitan M.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=eitan',
        contactEmail: 'eitan@example.com',
        inviteToken: generateInviteToken(),
        rsvpStatus: 'not_sure',
        adultsCount: 2,
        kidsCount: 0,
      })
      .returning()

    console.log(
      'Created participants:',
      negevOwner.participantId,
      negevP1.participantId,
      negevP2.participantId,
      negevP3.participantId,
      negevP4.participantId
    )

    const seedItems = [
      {
        name: 'Tent',
        category: 'group_equipment' as const,
        subcategory: 'Venue Setup and Layout',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Sleeping Bag',
        category: 'group_equipment' as const,
        subcategory: 'Comfort and Climate Control',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Camping Stove',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'First Aid Kit',
        category: 'group_equipment' as const,
        subcategory: 'First Aid and Safety',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Sunscreen',
        category: 'group_equipment' as const,
        subcategory: 'Games and Activities',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Insect Repellent',
        category: 'group_equipment' as const,
        subcategory: 'Other',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Cooler',
        category: 'group_equipment' as const,
        subcategory: 'Food Storage and Cooling',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Headlamp',
        category: 'group_equipment' as const,
        subcategory: 'Lighting and Visibility',
        quantity: 7,
        unit: 'pcs' as const,
      },
      {
        name: 'Folding Chair',
        category: 'group_equipment' as const,
        subcategory: 'Comfort and Climate Control',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Baby Wipes',
        category: 'group_equipment' as const,
        subcategory: 'Kids and Baby Gear',
        quantity: 5,
        unit: 'pack' as const,
      },
      {
        name: 'Diapers',
        category: 'group_equipment' as const,
        subcategory: 'Kids and Baby Gear',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Trash Bags',
        category: 'group_equipment' as const,
        subcategory: 'Food Storage and Cooling',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Water',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 30,
        unit: 'l' as const,
      },
      {
        name: 'Pita Bread',
        category: 'food' as const,
        subcategory: 'Grains and Pasta',
        quantity: 3,
        unit: 'pack' as const,
      },
      {
        name: 'Hummus',
        category: 'food' as const,
        subcategory: 'Snacks and Chips',
        quantity: 4,
        unit: 'pcs' as const,
      },
      {
        name: 'Eggs',
        category: 'food' as const,
        subcategory: 'Breakfast Staples',
        quantity: 30,
        unit: 'pcs' as const,
      },
      {
        name: 'Crackers',
        category: 'food' as const,
        subcategory: 'Snacks and Chips',
        quantity: 3,
        unit: 'pack' as const,
      },
      {
        name: 'Water Bottle',
        category: 'group_equipment' as const,
        subcategory: 'Drink and Beverage Equipment',
        quantity: 10,
        unit: 'pcs' as const,
      },
      {
        name: 'Portable Toilet',
        category: 'group_equipment' as const,
        subcategory: 'Venue Setup and Layout',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Water Jug',
        category: 'group_equipment' as const,
        subcategory: 'Drink and Beverage Equipment',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Groundsheet',
        category: 'group_equipment' as const,
        subcategory: 'Venue Setup and Layout',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Tarp',
        category: 'group_equipment' as const,
        subcategory: 'Venue Setup and Layout',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Lantern',
        category: 'group_equipment' as const,
        subcategory: 'Lighting and Visibility',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Matches',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Rope',
        category: 'group_equipment' as const,
        subcategory: 'Tools and Quick Repairs',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Duct Tape',
        category: 'group_equipment' as const,
        subcategory: 'Tools and Quick Repairs',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Power Bank',
        category: 'group_equipment' as const,
        subcategory: 'Power and Charging',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Spare Batteries',
        category: 'group_equipment' as const,
        subcategory: 'Power and Charging',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Aluminum Foil',
        category: 'group_equipment' as const,
        subcategory: 'Serving and Tableware',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Kitchen Knife',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Cutting Board',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Can Opener',
        category: 'group_equipment' as const,
        subcategory: 'Food Preparation Tools',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Paper Towels',
        category: 'group_equipment' as const,
        subcategory: 'Other',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Hand Sanitizer',
        category: 'group_equipment' as const,
        subcategory: 'Hygiene and Bathroom Supplies',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Sponge',
        category: 'group_equipment' as const,
        subcategory: 'Hygiene and Bathroom Supplies',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Wet Wipes',
        category: 'group_equipment' as const,
        subcategory: 'Hygiene and Bathroom Supplies',
        quantity: 3,
        unit: 'pack' as const,
      },
      {
        name: 'Flashlight',
        category: 'personal_equipment' as const,
        subcategory: 'Personal Essentials',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Air Mattress',
        category: 'personal_equipment' as const,
        subcategory: 'Sleeping Gear',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Camp Blanket',
        category: 'personal_equipment' as const,
        subcategory: 'Sleeping Gear',
        quantity: 4,
        unit: 'pcs' as const,
      },
      {
        name: 'Camping Pillow',
        category: 'personal_equipment' as const,
        subcategory: 'Sleeping Gear',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Emergency Blanket',
        category: 'personal_equipment' as const,
        subcategory: 'Sleeping Gear',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Bread',
        category: 'food' as const,
        subcategory: 'Breakfast Staples',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Cheese',
        category: 'food' as const,
        subcategory: 'Cheese',
        quantity: 1,
        unit: 'kg' as const,
      },
      {
        name: 'Chips',
        category: 'food' as const,
        subcategory: 'Snacks and Chips',
        quantity: 4,
        unit: 'pack' as const,
      },
      {
        name: 'Chocolate',
        category: 'food' as const,
        subcategory: 'Snacks and Chips',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Coffee',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 1,
        unit: 'pack' as const,
      },
      {
        name: 'Granola',
        category: 'food' as const,
        subcategory: 'Breakfast Staples',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Juice',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 3,
        unit: 'l' as const,
      },
      {
        name: 'Milk',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 3,
        unit: 'l' as const,
      },
      {
        name: 'Tea Bags',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 1,
        unit: 'pack' as const,
      },
      {
        name: 'Cucumber',
        category: 'food' as const,
        subcategory: 'Fresh Vegetables',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Tomatoes',
        category: 'food' as const,
        subcategory: 'Fresh Vegetables',
        quantity: 2,
        unit: 'kg' as const,
      },
      {
        name: 'Bananas',
        category: 'food' as const,
        subcategory: 'Fresh Fruit',
        quantity: 2,
        unit: 'kg' as const,
      },
      {
        name: 'Apples',
        category: 'food' as const,
        subcategory: 'Fresh Fruit',
        quantity: 2,
        unit: 'kg' as const,
      },
      {
        name: 'Olives',
        category: 'food' as const,
        subcategory: 'Sauces, Condiments, and Spreads',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Cooler Bag',
        category: 'group_equipment' as const,
        subcategory: 'Food Storage and Cooling',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Food Storage Containers',
        category: 'group_equipment' as const,
        subcategory: 'Food Storage and Cooling',
        quantity: 1,
        unit: 'set' as const,
      },
      {
        name: 'Ice Packs',
        category: 'group_equipment' as const,
        subcategory: 'Food Storage and Cooling',
        quantity: 4,
        unit: 'pcs' as const,
      },
      {
        name: 'Folding Table',
        category: 'group_equipment' as const,
        subcategory: 'Other',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Frisbee',
        category: 'group_equipment' as const,
        subcategory: 'Games and Activities',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Football',
        category: 'group_equipment' as const,
        subcategory: 'Games and Activities',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Map',
        category: 'group_equipment' as const,
        subcategory: 'Documentation and Access',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Tongs',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Toilet Paper',
        category: 'group_equipment' as const,
        subcategory: 'Hygiene and Bathroom Supplies',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Daypack',
        category: 'personal_equipment' as const,
        subcategory: 'Packs and Hydration',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Deodorant',
        category: 'personal_equipment' as const,
        subcategory: 'Hygiene and Toiletries',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Fleece Jacket',
        category: 'personal_equipment' as const,
        subcategory: 'Clothing and Layers',
        quantity: 4,
        unit: 'pcs' as const,
      },
      {
        name: 'Flip Flops',
        category: 'personal_equipment' as const,
        subcategory: 'Footwear',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Hat',
        category: 'personal_equipment' as const,
        subcategory: 'Headwear and Accessories',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Hiking Boots',
        category: 'personal_equipment' as const,
        subcategory: 'Footwear',
        quantity: 4,
        unit: 'pcs' as const,
      },
      {
        name: 'Hiking Pants',
        category: 'personal_equipment' as const,
        subcategory: 'Clothing and Layers',
        quantity: 4,
        unit: 'pcs' as const,
      },
      {
        name: 'Lip Balm',
        category: 'personal_equipment' as const,
        subcategory: 'Hygiene and Toiletries',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Sunglasses',
        category: 'personal_equipment' as const,
        subcategory: 'Headwear and Accessories',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Toothbrush',
        category: 'personal_equipment' as const,
        subcategory: 'Hygiene and Toiletries',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Wool Socks',
        category: 'personal_equipment' as const,
        subcategory: 'Footwear',
        quantity: 8,
        unit: 'pcs' as const,
      },
      {
        name: 'Chicken Breast',
        category: 'food' as const,
        subcategory: 'Meat and Poultry',
        quantity: 3,
        unit: 'kg' as const,
      },
      {
        name: 'Tofu',
        category: 'food' as const,
        subcategory: 'Vegan',
        quantity: 1,
        unit: 'kg' as const,
      },
      {
        name: 'Frozen Burgers',
        category: 'food' as const,
        subcategory: 'Frozen Foods',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Ice',
        category: 'food' as const,
        subcategory: 'Frozen Foods',
        quantity: 3,
        unit: 'pack' as const,
      },
      {
        name: 'Ice Cream',
        category: 'food' as const,
        subcategory: 'Frozen Foods',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Marshmallows',
        category: 'food' as const,
        subcategory: 'Snacks and Chips',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Beer',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Wine',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 2,
        unit: 'pcs' as const,
      },
    ]

    const pIds = [
      negevOwner.participantId,
      negevP1.participantId,
      negevP2.participantId,
      negevP3.participantId,
      negevP4.participantId,
    ]

    const negevItemValues = seedItems.map((item, i) => {
      if (i === 0) {
        return {
          planId: negevPlan.planId,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          quantity: item.quantity,
          unit: item.unit,
          isAllParticipants: true,
          assignmentStatusList: pIds.map((participantId) => ({
            participantId,
            status: 'pending' as const,
          })),
        }
      }
      if (i === 5 || i === 10) {
        return {
          planId: negevPlan.planId,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          quantity: item.quantity,
          unit: item.unit,
          isAllParticipants: false,
          assignmentStatusList: [] as Assignment[],
        }
      }
      return {
        planId: negevPlan.planId,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        quantity: item.quantity,
        unit: item.unit,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: pIds[i % 5], status: 'pending' as const },
        ],
      }
    })

    const negevItems = await db
      .insert(items)
      .values(negevItemValues)
      .returning()

    console.log(`Created ${negevItems.length} items`)

    const tent = negevItems.find((i) => i.name === 'Tent')!
    const sleepingBag = negevItems.find((i) => i.name === 'Sleeping Bag')!

    const [negevAiUsageLog] = await db
      .insert(aiUsageLogs)
      .values({
        featureType: 'item_suggestions',
        planId: negevPlan.planId,
        userId: seedOwnerUserId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'he',
        status: 'success',
        inputTokens: 1200,
        outputTokens: 800,
        totalTokens: 2000,
        durationMs: 4200,
        resultCount: 4,
        metadata: { planTitle: negevPlan.title, seed: true },
      })
      .returning()

    const insertedAiSuggestions = await db
      .insert(aiSuggestions)
      .values([
        {
          aiUsageLogId: negevAiUsageLog.id,
          planId: negevPlan.planId,
          name: 'Tent',
          category: 'group_equipment',
          subcategory: 'Shelter',
          quantity: '1',
          unit: 'pcs',
          reason:
            'Desert nights get cold — seed sample (accepted, linked to Tent item)',
          status: 'accepted',
          itemId: tent.itemId,
        },
        {
          aiUsageLogId: negevAiUsageLog.id,
          planId: negevPlan.planId,
          name: 'Portable shade canopy',
          category: 'group_equipment',
          subcategory: 'Shelter',
          quantity: '1',
          unit: 'pcs',
          reason:
            'Extra UV protection for toddlers — seed sample (still suggested)',
          status: 'suggested',
        },
        {
          aiUsageLogId: negevAiUsageLog.id,
          planId: negevPlan.planId,
          name: 'Wet wipes pack',
          category: 'personal_equipment',
          subcategory: 'Hygiene',
          quantity: '2',
          unit: 'pack',
          reason: 'Hand cleanup for kids — seed sample (still suggested)',
          status: 'suggested',
        },
      ])
      .returning()

    const sugAccepted = insertedAiSuggestions[0]!

    await db
      .update(items)
      .set({
        source: 'ai_suggestion',
        aiSuggestionId: sugAccepted.id,
      })
      .where(eq(items.itemId, tent.itemId))

    console.log(
      'Created AI usage log + 3 ai_suggestions (1 accepted→Tent, 2 suggested); Tent linked as ai_suggestion source'
    )
    const campingStove = negevItems.find((i) => i.name === 'Camping Stove')!
    const cooler = negevItems.find((i) => i.name === 'Cooler')!
    const water = negevItems.find((i) => i.name === 'Water')!
    const eggs = negevItems.find((i) => i.name === 'Eggs')!

    await db.insert(participantExpenses).values([
      {
        participantId: negevOwner.participantId,
        planId: negevPlan.planId,
        amount: '350.00',
        description: 'Tent and sleeping bags from camping store',
        itemIds: [tent.itemId, sleepingBag.itemId],
        createdByUserId: seedOwnerUserId,
      },
      {
        participantId: negevP1.participantId,
        planId: negevPlan.planId,
        amount: '120.50',
        description: 'Portable camping stove + gas canisters',
        itemIds: [campingStove.itemId],
        createdByUserId: seedOwnerUserId,
      },
      {
        participantId: negevP2.participantId,
        planId: negevPlan.planId,
        amount: '85.00',
        description: 'Coolers and ice packs',
        itemIds: [cooler.itemId],
        createdByUserId: seedOwnerUserId,
      },
      {
        participantId: negevP3.participantId,
        planId: negevPlan.planId,
        amount: '65.00',
        description: 'Water and eggs from supermarket',
        itemIds: [water.itemId, eggs.itemId],
        createdByUserId: seedOwnerUserId,
      },
      {
        participantId: negevP4.participantId,
        planId: negevPlan.planId,
        amount: '45.00',
        description: 'Gas for the drive',
        itemIds: [],
        createdByUserId: seedOwnerUserId,
      },
    ])

    console.log('Created 5 expenses (4 with linked items, 1 without)')

    const beachLocation: Location = {
      locationId: crypto.randomUUID(),
      name: 'Sunset Beach',
      country: 'USA',
      region: 'California',
      city: 'Santa Monica',
      latitude: 34.0195,
      longitude: -118.4912,
      timezone: 'America/Los_Angeles',
    }

    const [joinTestPlan] = await db
      .insert(plans)
      .values({
        title: 'Request to join test — Beach BBQ',
        description:
          'Invite-only plan for testing the join request flow. ' +
          'Sign in as owner to see pending requests, or as another user to request to join.',
        status: 'active',
        visibility: 'invite_only',
        location: beachLocation,
        startDate: dateDaysFromNow(35, 12, 0),
        endDate: dateDaysFromNow(35, 20, 0),
        tags: ['beach', 'beach_day', 'beach_cooking'],
        defaultLang: 'en',
        currency: 'USD',
        aiGenerationCount: 0,
        ...(seedOwnerUserId && { createdByUserId: seedOwnerUserId }),
      })
      .returning()

    const [joinTestOwner] = await db
      .insert(participants)
      .values({
        planId: joinTestPlan.planId,
        name: 'Alex',
        lastName: 'Owner',
        contactPhone: '+15551110000',
        displayName: 'Alex O.',
        role: 'owner',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
        contactEmail: 'alex.owner@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'accepted',
        rsvpStatus: 'confirmed',
        adultsCount: 2,
        kidsCount: 0,
        ...(seedOwnerUserId && { userId: seedOwnerUserId }),
      })
      .returning()

    await db
      .update(plans)
      .set({ ownerParticipantId: joinTestOwner.participantId })
      .where(eq(plans.planId, joinTestPlan.planId))

    const requester1UserId = 'bbbbbbbb-1111-2222-3333-444444444444'
    const requester2UserId = 'cccccccc-1111-2222-3333-444444444444'

    await db.insert(participantJoinRequests).values([
      {
        planId: joinTestPlan.planId,
        supabaseUserId: requester1UserId,
        name: 'Jordan',
        lastName: 'Requester',
        contactPhone: '+15552220000',
        contactEmail: 'jordan@example.com',
        displayName: 'Jordan R.',
        adultsCount: 1,
        kidsCount: 0,
        foodPreferences: 'vegan',
        allergies: 'shellfish',
        notes: 'Excited to join!',
        status: 'pending',
      },
      {
        planId: joinTestPlan.planId,
        supabaseUserId: requester2UserId,
        name: 'Sam',
        lastName: 'Pending',
        contactPhone: '+15553330000',
        adultsCount: 2,
        kidsCount: 1,
        status: 'pending',
      },
    ])

    await db.insert(items).values([
      {
        planId: joinTestPlan.planId,
        name: 'Grill',
        category: 'group_equipment',
        subcategory: 'Cooking and Heating Equipment',
        quantity: 1,
        unit: 'pcs',
        isAllParticipants: false,
        assignmentStatusList: [
          {
            participantId: joinTestOwner.participantId,
            status: 'pending' as const,
          },
        ],
      },
      {
        planId: joinTestPlan.planId,
        name: 'Burgers',
        category: 'food',
        subcategory: 'Meat and Proteins',
        quantity: 12,
        unit: 'pcs',
        isAllParticipants: false,
        assignmentStatusList: [] as Assignment[],
      },
      {
        planId: joinTestPlan.planId,
        name: 'Veggie Burgers',
        category: 'food',
        subcategory: 'Vegan',
        quantity: 6,
        unit: 'pcs',
        isAllParticipants: false,
        assignmentStatusList: [] as Assignment[],
      },
      {
        planId: joinTestPlan.planId,
        name: 'Charcoal',
        category: 'group_equipment',
        subcategory: 'Cooking and Heating Equipment',
        quantity: 2,
        unit: 'pack',
        isAllParticipants: false,
        assignmentStatusList: [] as Assignment[],
      },
    ])

    console.log('Created plan:', joinTestPlan.planId)
    console.log('  Title:', joinTestPlan.title)
    console.log('  Join requests: 2 (pending)')
    console.log('  Items: 4')

    const palmachimLocation: Location = {
      locationId: crypto.randomUUID(),
      name: 'Palmachim Beach',
      country: 'Israel',
      region: 'Central District',
      city: 'Rishon LeZion',
      latitude: 31.9275,
      longitude: 34.6942,
      timezone: 'Asia/Jerusalem',
    }

    const [bbqPlan] = await db
      .insert(plans)
      .values({
        title: 'Beach BBQ — Friday Sunset',
        description:
          'Chill Friday evening BBQ at Palmachim beach. ' +
          'Bring your own drinks, we handle the grill and meat. ' +
          'Sunset at 19:30, arrive by 17:00 for setup.',
        status: 'active',
        visibility: 'invite_only',
        location: palmachimLocation,
        startDate: dateDaysFromNow(21, 17, 0),
        endDate: dateDaysFromNow(21, 22, 0),
        tags: ['dinner_party', 'dinner_bbq', 'bbq_shared_food'],
        defaultLang: 'he',
        currency: 'ILS',
        itemQuantitySource: 'participant_reported',
        aiGenerationCount: 0,
        ...(seedOwnerUserId && { createdByUserId: seedOwnerUserId }),
      })
      .returning()

    const [bbqOwner] = await db
      .insert(participants)
      .values({
        planId: bbqPlan.planId,
        name: 'Lior',
        lastName: 'Katz',
        contactPhone: '+972507778888',
        displayName: 'Lior K.',
        role: 'owner',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lior',
        contactEmail: 'lior@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'accepted',
        rsvpStatus: 'confirmed',
        adultsCount: 2,
        kidsCount: 0,
      })
      .returning()

    await db
      .update(plans)
      .set({ ownerParticipantId: bbqOwner.participantId })
      .where(eq(plans.planId, bbqPlan.planId))

    const [bbqYou] = await db
      .insert(participants)
      .values({
        planId: bbqPlan.planId,
        name: 'Alex',
        lastName: 'G.',
        contactPhone: '+972509990000',
        displayName: 'Alex G.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alexg',
        contactEmail: 'alex@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'accepted',
        rsvpStatus: 'confirmed',
        adultsCount: 1,
        kidsCount: 0,
        ...(seedOwnerUserId && { userId: seedOwnerUserId }),
      })
      .returning()

    const [bbqP2] = await db
      .insert(participants)
      .values({
        planId: bbqPlan.planId,
        name: 'Tal',
        lastName: 'Alon',
        contactPhone: '+972528881111',
        displayName: 'Tal A.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tal',
        contactEmail: 'tal@example.com',
        inviteToken: generateInviteToken(),
        inviteStatus: 'invited',
        rsvpStatus: 'not_sure',
        adultsCount: 2,
        kidsCount: 1,
      })
      .returning()

    const bbqPIds = [
      bbqOwner.participantId,
      bbqYou.participantId,
      bbqP2.participantId,
    ]

    await db.insert(items).values([
      {
        planId: bbqPlan.planId,
        name: 'Portable Grill',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 1,
        unit: 'pcs' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[0], status: 'pending' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Charcoal',
        category: 'group_equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 2,
        unit: 'pack' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[0], status: 'purchased' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Beach Blanket',
        category: 'group_equipment' as const,
        subcategory: 'Comfort and Climate Control',
        quantity: 3,
        unit: 'pcs' as const,
        isAllParticipants: true,
        assignmentStatusList: bbqPIds.map((pid) => ({
          participantId: pid,
          status: 'pending' as const,
        })),
      },
      {
        planId: bbqPlan.planId,
        name: 'Bluetooth Speaker',
        category: 'group_equipment' as const,
        subcategory: 'Games and Activities',
        quantity: 1,
        unit: 'pcs' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[1], status: 'packed' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Burger Patties',
        category: 'food' as const,
        subcategory: 'Meat and Proteins',
        quantity: 12,
        unit: 'pcs' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[0], status: 'purchased' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Burger Buns',
        category: 'food' as const,
        subcategory: 'Grains and Pasta',
        quantity: 12,
        unit: 'pcs' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[1], status: 'pending' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Beer',
        category: 'food' as const,
        subcategory: 'Beverages (alcoholic)',
        quantity: 12,
        unit: 'pcs' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[2], status: 'pending' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Lemonade',
        category: 'food' as const,
        subcategory: 'Beverages (non-alcoholic)',
        quantity: 3,
        unit: 'l' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[1], status: 'purchased' as const },
        ],
      },
      {
        planId: bbqPlan.planId,
        name: 'Watermelon',
        category: 'food' as const,
        subcategory: 'Fresh Produce',
        quantity: 1,
        unit: 'pcs' as const,
        isAllParticipants: false,
        assignmentStatusList: [] as Assignment[],
      },
      {
        planId: bbqPlan.planId,
        name: 'Paper Plates',
        category: 'group_equipment' as const,
        subcategory: 'Other',
        quantity: 1,
        unit: 'pack' as const,
        isAllParticipants: false,
        assignmentStatusList: [
          { participantId: bbqPIds[2], status: 'pending' as const },
        ],
      },
    ])

    await db.insert(participantExpenses).values([
      {
        participantId: bbqOwner.participantId,
        planId: bbqPlan.planId,
        amount: '180.00',
        description: 'Meat and buns from the butcher',
        itemIds: [],
        createdByUserId: null,
      },
      {
        participantId: bbqYou.participantId,
        planId: bbqPlan.planId,
        amount: '55.00',
        description: 'Lemonade and snacks',
        itemIds: [],
        createdByUserId: seedOwnerUserId,
      },
      {
        participantId: bbqP2.participantId,
        planId: bbqPlan.planId,
        amount: '92.00',
        description: 'Beer + watermelon',
        itemIds: [],
        createdByUserId: null,
      },
    ])

    console.log('Created BBQ plan:', bbqPlan.planId)
    console.log('  Title:', bbqPlan.title)
    console.log('  Participants: 3, Items: 10, Expenses: 3')

    await db.insert(aiUsageLogs).values([
      {
        featureType: 'item_suggestions',
        planId: negevPlan.planId,
        userId: seedOwnerUserId,
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        lang: 'he',
        status: 'success',
        inputTokens: 1850,
        outputTokens: 3200,
        totalTokens: 5050,
        estimatedCost: '0.053550',
        durationMs: 8400,
        promptLength: 2100,
        resultCount: 38,
        metadata: { planTitle: negevPlan.title },
      },
      {
        featureType: 'item_suggestions',
        planId: bbqPlan.planId,
        userId: null,
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        lang: 'he',
        status: 'partial',
        inputTokens: 1600,
        outputTokens: 2800,
        totalTokens: 4400,
        estimatedCost: '0.046800',
        durationMs: 7200,
        promptLength: 1800,
        resultCount: 25,
        metadata: { planTitle: bbqPlan.title },
      },
      {
        featureType: 'item_suggestions',
        planId: joinTestPlan.planId,
        userId: seedOwnerUserId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'en',
        status: 'success',
        inputTokens: 1400,
        outputTokens: 2500,
        totalTokens: 3900,
        estimatedCost: '0.011120',
        durationMs: 4100,
        promptLength: 1600,
        resultCount: 32,
        metadata: { planTitle: joinTestPlan.title },
      },
      {
        featureType: 'item_suggestions',
        planId: negevPlan.planId,
        userId: seedOwnerUserId,
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        lang: 'he',
        status: 'error',
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        estimatedCost: undefined,
        durationMs: 12000,
        promptLength: 2100,
        resultCount: undefined,
        errorMessage: 'AI_APICallError: 529 Overloaded',
        metadata: { planTitle: negevPlan.title },
      },
    ])

    console.log('Created 4 AI usage logs (2 success, 1 partial, 1 error)')

    const chatbotSessionId1 = crypto.randomUUID()
    const chatbotSessionId2 = crypto.randomUUID()
    const chatbotSessionId3 = crypto.randomUUID()
    const now = new Date()
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)

    await db.insert(chatbotAiUsage).values([
      {
        sessionId: chatbotSessionId1,
        userId: seedOwnerUserId ?? undefined,
        planId: negevPlan.planId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'he',
        chatType: 'dm',
        messageIndex: 0,
        stepCount: 3,
        toolCalls: ['getMyPlans', 'getPlanDetails', 'getItemsForPlan'],
        toolCallCount: 3,
        inputTokens: 2400,
        outputTokens: 1800,
        totalTokens: 4200,
        estimatedCost: '0.008340',
        durationMs: 5200,
        status: 'success',
        createdAt: hoursAgo(2),
      },
      {
        sessionId: chatbotSessionId1,
        userId: seedOwnerUserId ?? undefined,
        planId: negevPlan.planId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'he',
        chatType: 'dm',
        messageIndex: 1,
        stepCount: 2,
        toolCalls: ['updateItemStatus'],
        toolCallCount: 1,
        inputTokens: 3100,
        outputTokens: 800,
        totalTokens: 3900,
        estimatedCost: '0.005100',
        durationMs: 3100,
        status: 'success',
        createdAt: hoursAgo(1.9),
      },
      {
        sessionId: chatbotSessionId1,
        userId: seedOwnerUserId ?? undefined,
        planId: negevPlan.planId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'he',
        chatType: 'dm',
        messageIndex: 2,
        stepCount: 1,
        toolCalls: [],
        toolCallCount: 0,
        inputTokens: 3800,
        outputTokens: 600,
        totalTokens: 4400,
        estimatedCost: '0.005400',
        durationMs: 2100,
        status: 'success',
        createdAt: hoursAgo(1.8),
      },
      {
        sessionId: chatbotSessionId2,
        userId: seedOwnerUserId ?? undefined,
        planId: bbqPlan.planId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'en',
        chatType: 'dm',
        messageIndex: 0,
        stepCount: 2,
        toolCalls: ['getMyPlans', 'getPlanDetails'],
        toolCallCount: 2,
        inputTokens: 2000,
        outputTokens: 1500,
        totalTokens: 3500,
        estimatedCost: '0.006500',
        durationMs: 4800,
        status: 'success',
        createdAt: hoursAgo(12),
      },
      {
        sessionId: chatbotSessionId2,
        userId: seedOwnerUserId ?? undefined,
        planId: bbqPlan.planId,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'en',
        chatType: 'dm',
        messageIndex: 1,
        stepCount: 1,
        toolCalls: [],
        toolCallCount: 0,
        inputTokens: 3200,
        outputTokens: 400,
        totalTokens: 3600,
        estimatedCost: '0.004200',
        durationMs: 1800,
        status: 'error',
        errorMessage: 'AI_APICallError: 529 Overloaded',
        createdAt: hoursAgo(11.5),
      },
      {
        sessionId: chatbotSessionId3,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'he',
        chatType: 'group',
        messageIndex: 0,
        stepCount: 2,
        toolCalls: ['getMyPlans'],
        toolCallCount: 1,
        inputTokens: 1800,
        outputTokens: 1200,
        totalTokens: 3000,
        estimatedCost: '0.005400',
        durationMs: 3900,
        status: 'success',
        createdAt: hoursAgo(24),
      },
      {
        sessionId: chatbotSessionId3,
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        lang: 'he',
        chatType: 'group',
        messageIndex: 1,
        stepCount: 3,
        toolCalls: ['getPlanDetails', 'getItemsForPlan', 'updateItemStatus'],
        toolCallCount: 3,
        inputTokens: 3600,
        outputTokens: 2200,
        totalTokens: 5800,
        estimatedCost: '0.010600',
        durationMs: 7400,
        status: 'success',
        createdAt: hoursAgo(23.5),
      },
    ])

    console.log('Created 7 chatbot AI usage logs (3 sessions: 2 DM, 1 group)')

    console.log('\n--- Seed Summary ---')
    console.log('')
    console.log('Plan 1 (you = OWNER) — use this for the large item list:')
    console.log('  ID:', negevPlan.planId)
    console.log('  Title:', negevPlan.title)
    console.log('  Owner:', negevOwner.name, negevOwner.lastName)
    console.log('  Participants: 5, Items: 82, Expenses: 5')
    if (seedOwnerUserId) {
      console.log('  → Your Supabase ID linked as owner')
    }
    console.log('')
    console.log('Plan 2 (join request test):')
    console.log('  ID:', joinTestPlan.planId)
    console.log('  Title:', joinTestPlan.title)
    console.log('  Join requests: 2 pending (Jordan, Sam)')
    console.log('  Items: 4')
    console.log('')
    console.log('Plan 3 (you = PARTICIPANT):')
    console.log('  ID:', bbqPlan.planId)
    console.log('  Title:', bbqPlan.title)
    console.log('  Owner:', bbqOwner.name, bbqOwner.lastName, '(NPC)')
    console.log('  Participants: 3, Items: 10, Expenses: 3')
    if (seedOwnerUserId) {
      console.log('  → Your Supabase ID linked as participant Alex G.')
    }
    console.log('')
    console.log('Chatbot AI Usage:')
    console.log('  7 logs across 3 sessions (2 DM, 1 group)')
    console.log('  5 success, 1 error, mixed tool calls')
    console.log('')

    console.log('Seeding completed successfully')
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seed()
