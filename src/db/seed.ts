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
  participantJoinRequests,
  type Location,
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
      sql`TRUNCATE plans, participants, items, plan_invites, participant_join_requests, guest_profiles, user_details CASCADE`
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
        tags: ['camping', 'desert', 'negev', 'family', 'toddlers'],
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
        name: 'Dan',
        lastName: 'Levy',
        contactPhone: '+972-50-111-2222',
        displayName: 'Dan L.',
        role: 'owner',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dan',
        contactEmail: 'dan@example.com',
        inviteToken: generateInviteToken(),
        rsvpStatus: 'confirmed',
        adultsCount: 2,
        kidsCount: 3,
        ...(seedOwnerUserId && { userId: seedOwnerUserId }),
      })
      .returning()

    await db.update(plans).set({ ownerParticipantId: negevOwner.participantId })

    const [negevP1] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Yael',
        lastName: 'Cohen',
        contactPhone: '+972-52-222-3333',
        displayName: 'Yael C.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yael',
        contactEmail: 'yael@example.com',
        inviteToken: generateInviteToken(),
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
        contactPhone: '+972-54-333-4444',
        displayName: 'Omer B.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=omer',
        contactEmail: 'omer@example.com',
        inviteToken: generateInviteToken(),
        rsvpStatus: 'confirmed',
      })
      .returning()

    const [negevP3] = await db
      .insert(participants)
      .values({
        planId: negevPlan.planId,
        name: 'Noa',
        lastName: 'Shapira',
        contactPhone: '+972-53-444-5555',
        displayName: 'Noa S.',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=noa',
        contactEmail: 'noa@example.com',
        inviteToken: generateInviteToken(),
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
        contactPhone: '+972-58-555-6666',
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
        category: 'equipment' as const,
        subcategory: 'Venue Setup and Layout',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Sleeping Bag',
        category: 'equipment' as const,
        subcategory: 'Comfort and Climate Control',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Camping Stove',
        category: 'equipment' as const,
        subcategory: 'Cooking and Heating Equipment',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'First Aid Kit',
        category: 'equipment' as const,
        subcategory: 'First Aid and Safety',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Sunscreen',
        category: 'equipment' as const,
        subcategory: 'Games and Activities',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Insect Repellent',
        category: 'equipment' as const,
        subcategory: 'Other',
        quantity: 3,
        unit: 'pcs' as const,
      },
      {
        name: 'Cooler',
        category: 'equipment' as const,
        subcategory: 'Food Storage and Cooling',
        quantity: 2,
        unit: 'pcs' as const,
      },
      {
        name: 'Headlamp',
        category: 'equipment' as const,
        subcategory: 'Lighting and Visibility',
        quantity: 7,
        unit: 'pcs' as const,
      },
      {
        name: 'Folding Chair',
        category: 'equipment' as const,
        subcategory: 'Comfort and Climate Control',
        quantity: 5,
        unit: 'pcs' as const,
      },
      {
        name: 'Baby Wipes',
        category: 'equipment' as const,
        subcategory: 'Kids and Baby Gear',
        quantity: 5,
        unit: 'pack' as const,
      },
      {
        name: 'Diapers',
        category: 'equipment' as const,
        subcategory: 'Kids and Baby Gear',
        quantity: 2,
        unit: 'pack' as const,
      },
      {
        name: 'Trash Bags',
        category: 'equipment' as const,
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
        category: 'equipment' as const,
        subcategory: 'Drink and Beverage Equipment',
        quantity: 10,
        unit: 'pcs' as const,
      },
      {
        name: 'Portable Toilet',
        category: 'equipment' as const,
        subcategory: 'Venue Setup and Layout',
        quantity: 1,
        unit: 'pcs' as const,
      },
      {
        name: 'Water Jug',
        category: 'equipment' as const,
        subcategory: 'Drink and Beverage Equipment',
        quantity: 3,
        unit: 'pcs' as const,
      },
    ]

    const participantsForAssignment = [
      negevOwner.participantId,
      negevP1.participantId,
      negevP2.participantId,
      negevP3.participantId,
      negevP4.participantId,
    ]

    await db.insert(items).values(
      seedItems.map((item, i) => ({
        planId: negevPlan.planId,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        quantity: item.quantity,
        unit: item.unit,
        status: 'pending' as const,
        assignmentStatusList: [
          {
            participantId: participantsForAssignment[i % 5],
            status: 'pending' as const,
          },
        ],
      }))
    )

    console.log('Created 20 items')

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
        tags: ['bbq', 'beach', 'test', 'join-request'],
        ...(seedOwnerUserId && { createdByUserId: seedOwnerUserId }),
      })
      .returning()

    const [joinTestOwner] = await db
      .insert(participants)
      .values({
        planId: joinTestPlan.planId,
        name: 'Alex',
        lastName: 'Owner',
        contactPhone: '+1-555-111-0000',
        displayName: 'Alex O.',
        role: 'owner',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
        contactEmail: 'alex.owner@example.com',
        inviteToken: generateInviteToken(),
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
        contactPhone: '+1-555-222-0000',
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
        contactPhone: '+1-555-333-0000',
        adultsCount: 2,
        kidsCount: 1,
        status: 'pending',
      },
    ])

    await db.insert(items).values([
      {
        planId: joinTestPlan.planId,
        name: 'Grill',
        category: 'equipment',
        subcategory: 'Cooking and Heating Equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
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
        status: 'pending',
      },
      {
        planId: joinTestPlan.planId,
        name: 'Veggie Burgers',
        category: 'food',
        subcategory: 'Vegan',
        quantity: 6,
        unit: 'pcs',
        status: 'pending',
      },
      {
        planId: joinTestPlan.planId,
        name: 'Charcoal',
        category: 'equipment',
        subcategory: 'Cooking and Heating Equipment',
        quantity: 2,
        unit: 'pack',
        status: 'pending',
      },
    ])

    console.log('Created plan:', joinTestPlan.planId)
    console.log('  Title:', joinTestPlan.title)
    console.log('  Join requests: 2 (pending)')
    console.log('  Items: 4')

    console.log('\n--- Seed Summary ---')
    console.log('Negev Plan ID:', negevPlan.planId)
    console.log('  Title:', negevPlan.title)
    console.log('  Owner:', negevOwner.name, negevOwner.lastName)
    console.log('  Participants: 5, Items: 20')
    console.log('')
    console.log('Join Request Test Plan ID:', joinTestPlan.planId)
    console.log('  Title:', joinTestPlan.title)
    console.log('  Owner: Alex Owner (link with SEED_OWNER_USER_ID)')
    console.log('  Join requests: 2 pending (Jordan, Sam)')
    console.log('  Items: 4')
    console.log(
      '  To test: SEED_OWNER_USER_ID=your-supabase-uuid, sign in as owner'
    )
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
