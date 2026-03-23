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
      sql`TRUNCATE plans, participants, items, plan_invites, participant_join_requests, participant_expenses, guest_profiles, user_details, whatsapp_notifications CASCADE`
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
