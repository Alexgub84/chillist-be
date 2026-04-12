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
  chatbotAiUsage,
  planTagVersions,
  planTagOptions,
  type Location,
  type Assignment,
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

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

const connectionString = process.env.DATABASE_URL
const seedOwnerUserId = process.env.SEED_OWNER_USER_ID ?? null

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
      sql`TRUNCATE plans, participants, items, plan_invites, participant_join_requests, participant_expenses, guest_profiles, users, whatsapp_notifications, ai_usage_logs, plan_tag_versions CASCADE`
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
        title: 'Desert Camping — Negev Family Trip',
        description:
          '5 adults and 5 toddlers camping in the Negev desert. ' +
          'Kid-friendly activities, short hikes, and stargazing. ' +
          'Extra shade structures and water supply are essential for the little ones.',
        status: 'active',
        visibility: 'public',
        location: negevLocation,
        startDate: new Date('2026-04-03T08:00:00+03:00'),
        endDate: new Date('2026-04-04T16:00:00+03:00'),
        tags: ['camping', 'camping_cooking', 'camping_tent', 'camping_wild'],
        defaultLang: 'he',
        currency: 'ILS',
        estimatedAdults: 7,
        estimatedKids: 5,
        aiGenerationCount: 0,
        ...(seedOwnerUserId && { createdByUserId: seedOwnerUserId }),
      })
      .returning()

    console.log('Created plan:', negevPlan.planId)
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

    console.log('Created 20 items')

    const tent = negevItems.find((i) => i.name === 'Tent')!
    const sleepingBag = negevItems.find((i) => i.name === 'Sleeping Bag')!
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
        startDate: new Date('2026-05-15T12:00:00-07:00'),
        endDate: new Date('2026-05-15T20:00:00-07:00'),
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
        startDate: new Date('2026-04-10T17:00:00+03:00'),
        endDate: new Date('2026-04-10T22:00:00+03:00'),
        tags: ['dinner_party', 'dinner_bbq', 'bbq_shared_food'],
        defaultLang: 'he',
        currency: 'ILS',
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
    console.log('Plan 1 (you = OWNER):')
    console.log('  ID:', negevPlan.planId)
    console.log('  Title:', negevPlan.title)
    console.log('  Owner:', negevOwner.name, negevOwner.lastName)
    console.log('  Participants: 5, Items: 20, Expenses: 5')
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

    // --- Plan Tag Taxonomy v1.2 ---
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
        version: '1.2',
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

    console.log('Plan Tag Taxonomy v1.2:')
    console.log(
      `  ${tagOptions.filter((o) => o.tier === 1).length} tier-1 options`
    )
    console.log(
      `  ${tagOptions.filter((o) => o.tier === 2).length} tier-2 options`
    )
    console.log(
      `  ${tagOptions.filter((o) => o.tier === 3).length} tier-3 options`
    )
    console.log('')
    console.log('--------------------\n')

    console.log('Seeding completed successfully')
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seed()
