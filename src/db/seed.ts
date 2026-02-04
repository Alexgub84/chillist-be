import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  plans,
  participants,
  items,
  itemAssignments,
  type Location,
} from './schema.js'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

async function seed() {
  console.log('Seeding database...')

  try {
    const location: Location = {
      locationId: crypto.randomUUID(),
      name: 'Yosemite National Park',
      country: 'United States',
      region: 'California',
      city: 'Mariposa',
      latitude: 37.8651,
      longitude: -119.5383,
      timezone: 'America/Los_Angeles',
    }

    const [plan] = await db
      .insert(plans)
      .values({
        title: 'Weekend Camping Trip',
        description:
          'A fun weekend camping trip to Yosemite National Park with friends. We will hike, camp, and enjoy nature.',
        status: 'active',
        visibility: 'public',
        location,
        startDate: new Date('2026-03-15T09:00:00Z'),
        endDate: new Date('2026-03-17T18:00:00Z'),
        tags: ['camping', 'hiking', 'nature', 'friends'],
      })
      .returning()

    console.log('Created plan:', plan.planId)

    const [owner] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        displayName: 'Alex',
        name: 'Alex',
        lastName: 'Guberman',
        role: 'owner',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
        contactEmail: 'alex@example.com',
        contactPhone: '+1-555-123-4567',
      })
      .returning()

    console.log('Created owner participant:', owner.participantId)

    await db.update(plans).set({ ownerParticipantId: owner.participantId })

    const [participant1] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        displayName: 'Sarah',
        name: 'Sarah',
        lastName: 'Johnson',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
        contactEmail: 'sarah@example.com',
        contactPhone: '+1-555-234-5678',
      })
      .returning()

    const [participant2] = await db
      .insert(participants)
      .values({
        planId: plan.planId,
        displayName: 'Mike',
        name: 'Michael',
        lastName: 'Chen',
        role: 'participant',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
        contactEmail: 'mike@example.com',
        contactPhone: '+1-555-345-6789',
      })
      .returning()

    console.log(
      'Created participants:',
      participant1.participantId,
      participant2.participantId
    )

    const [tent] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: '4-Person Tent',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
        notes: 'Waterproof tent with rainfly',
      })
      .returning()

    const [sleepingBags] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: 'Sleeping Bags',
        category: 'equipment',
        quantity: 3,
        unit: 'pcs',
        status: 'purchased',
        notes: 'Rated for 30°F',
      })
      .returning()

    const [cooler] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: 'Cooler',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'packed',
        notes: '50 quart capacity',
      })
      .returning()

    const [water] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: 'Water Bottles',
        category: 'food',
        quantity: 12,
        unit: 'pcs',
        status: 'pending',
        notes: '16oz bottles',
      })
      .returning()

    const [snacks] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: 'Trail Mix',
        category: 'food',
        quantity: 2,
        unit: 'kg',
        status: 'pending',
        notes: 'Mixed nuts and dried fruit',
      })
      .returning()

    const [hotdogs] = await db
      .insert(items)
      .values({
        planId: plan.planId,
        name: 'Hot Dogs',
        category: 'food',
        quantity: 12,
        unit: 'pcs',
        status: 'pending',
        notes: 'For campfire cooking',
      })
      .returning()

    console.log(
      'Created items:',
      tent.itemId,
      sleepingBags.itemId,
      cooler.itemId,
      water.itemId,
      snacks.itemId,
      hotdogs.itemId
    )

    await db.insert(itemAssignments).values([
      {
        planId: plan.planId,
        itemId: tent.itemId,
        participantId: owner.participantId,
        quantityAssigned: 1,
        notes: 'Alex will bring the tent from home',
        isConfirmed: true,
      },
      {
        planId: plan.planId,
        itemId: sleepingBags.itemId,
        participantId: owner.participantId,
        quantityAssigned: 1,
        notes: 'One sleeping bag',
        isConfirmed: true,
      },
      {
        planId: plan.planId,
        itemId: sleepingBags.itemId,
        participantId: participant1.participantId,
        quantityAssigned: 1,
        notes: 'One sleeping bag',
        isConfirmed: true,
      },
      {
        planId: plan.planId,
        itemId: sleepingBags.itemId,
        participantId: participant2.participantId,
        quantityAssigned: 1,
        notes: 'One sleeping bag',
        isConfirmed: false,
      },
      {
        planId: plan.planId,
        itemId: cooler.itemId,
        participantId: participant1.participantId,
        quantityAssigned: 1,
        notes: 'Sarah has a large cooler',
        isConfirmed: true,
      },
      {
        planId: plan.planId,
        itemId: water.itemId,
        participantId: participant2.participantId,
        quantityAssigned: 12,
        notes: 'Mike will pick up water at Costco',
        isConfirmed: false,
      },
      {
        planId: plan.planId,
        itemId: snacks.itemId,
        participantId: participant1.participantId,
        quantityAssigned: 2,
        notes: 'Trail mix for hiking',
        isConfirmed: true,
      },
      {
        planId: plan.planId,
        itemId: hotdogs.itemId,
        participantId: owner.participantId,
        quantityAssigned: 12,
        notes: 'Will buy day before trip',
        isConfirmed: false,
      },
    ])

    console.log('Created item assignments')

    console.log('\n--- Sample Plan Created ---')
    console.log('Plan ID:', plan.planId)
    console.log('Title:', plan.title)
    console.log('Owner:', owner.displayName)
    console.log('Participants: 3')
    console.log('Items: 6')
    console.log('Assignments: 8')
    console.log('---------------------------\n')

    console.log('Seeding completed successfully')
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seed()
