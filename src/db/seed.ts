import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { plans, participants, items, type Location } from './schema.js'

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
      sql`TRUNCATE plans, participants, items, plan_invites, guest_profiles, user_details CASCADE`
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
        assignedParticipantId: participantsForAssignment[i % 5],
      }))
    )

    console.log('Created 20 items')

    console.log('\n--- Seed Summary ---')
    console.log('Plan ID:', negevPlan.planId)
    console.log('Title:', negevPlan.title)
    console.log('Owner:', negevOwner.name, negevOwner.lastName)
    console.log('Participants: 5')
    console.log('Items: 20 (from common-items.json)')
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
