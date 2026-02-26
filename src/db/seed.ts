import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { plans, participants, items, type Location } from './schema.js'

function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

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
      })
      .returning()

    console.log('Created plan:', negevPlan.planId)

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

    await db.insert(items).values([
      {
        planId: negevPlan.planId,
        name: 'Family Tent (6-person)',
        category: 'equipment',
        quantity: 3,
        unit: 'pcs',
        status: 'pending',
        notes: 'UV-resistant with good ventilation for desert heat',
        assignedParticipantId: negevOwner.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Pop-up Shade Canopy',
        category: 'equipment',
        quantity: 2,
        unit: 'pcs',
        status: 'pending',
        notes: 'Essential shade for toddlers during daytime',
        assignedParticipantId: negevP1.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Sleeping Bags (Adult)',
        category: 'equipment',
        quantity: 5,
        unit: 'pcs',
        status: 'pending',
        notes: 'Desert nights get cold — rated for 5°C',
        assignedParticipantId: negevP2.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Toddler Sleeping Bags',
        category: 'equipment',
        quantity: 5,
        unit: 'pcs',
        status: 'pending',
        notes: 'Small-size sleeping bags for the kids',
      },
      {
        planId: negevPlan.planId,
        name: 'Camping Mattresses / Pads',
        category: 'equipment',
        quantity: 10,
        unit: 'pcs',
        status: 'pending',
        notes: '5 adult + 5 toddler pads',
        assignedParticipantId: negevP3.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Portable Camping Stove',
        category: 'equipment',
        quantity: 2,
        unit: 'pcs',
        status: 'pending',
        notes: 'Gas burner with wind guard',
        assignedParticipantId: negevOwner.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Headlamps / Flashlights',
        category: 'equipment',
        quantity: 7,
        unit: 'pcs',
        status: 'pending',
        notes: '5 for adults + 2 extra kid-safe lanterns',
        assignedParticipantId: negevP4.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'First Aid Kit',
        category: 'equipment',
        quantity: 2,
        unit: 'pcs',
        status: 'pending',
        notes: 'Include child-safe meds, sunburn cream, insect repellent',
        assignedParticipantId: negevP1.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Portable High Chairs',
        category: 'equipment',
        quantity: 3,
        unit: 'pcs',
        status: 'pending',
        notes: 'Collapsible camping high chairs for toddlers',
      },
      {
        planId: negevPlan.planId,
        name: 'Cooler Box (Large)',
        category: 'equipment',
        quantity: 2,
        unit: 'pcs',
        status: 'pending',
        notes: '60L coolers — one for food, one for drinks',
        assignedParticipantId: negevP2.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Folding Camping Table',
        category: 'equipment',
        quantity: 2,
        unit: 'pcs',
        status: 'pending',
        notes: 'For cooking and eating',
        assignedParticipantId: negevP3.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Camping Chairs',
        category: 'equipment',
        quantity: 5,
        unit: 'pcs',
        status: 'pending',
        notes: 'Foldable chairs for adults',
        assignedParticipantId: negevP4.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Sunscreen SPF 50+',
        category: 'equipment',
        quantity: 5,
        unit: 'pcs',
        status: 'pending',
        notes: 'Baby-safe sunscreen for toddlers, regular for adults',
      },
      {
        planId: negevPlan.planId,
        name: 'Wide-brim Sun Hats',
        category: 'equipment',
        quantity: 10,
        unit: 'pcs',
        status: 'pending',
        notes: '5 adult + 5 toddler hats — mandatory for desert',
      },
      {
        planId: negevPlan.planId,
        name: 'Portable Toilet / Potty',
        category: 'equipment',
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
        notes: 'For the toddlers',
      },
      {
        planId: negevPlan.planId,
        name: 'Trash Bags',
        category: 'equipment',
        quantity: 1,
        unit: 'pack',
        status: 'pending',
        notes: 'Leave no trace — pack out all waste',
      },
      {
        planId: negevPlan.planId,
        name: 'Jerry Can (Water)',
        category: 'equipment',
        quantity: 3,
        unit: 'pcs',
        status: 'pending',
        notes: '20L each — total 60L for drinking/cooking/washing',
        assignedParticipantId: negevOwner.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Baby Wipes',
        category: 'equipment',
        quantity: 5,
        unit: 'pack',
        status: 'pending',
        notes: 'Essential with toddlers in the desert',
      },
      {
        planId: negevPlan.planId,
        name: 'Diapers',
        category: 'equipment',
        quantity: 2,
        unit: 'pack',
        status: 'pending',
        notes: 'For the younger toddlers if needed',
      },
      {
        planId: negevPlan.planId,
        name: 'Drinking Water (Bottles)',
        category: 'food',
        quantity: 30,
        unit: 'l',
        status: 'pending',
        notes: 'Extra water supply — desert hydration is critical',
        assignedParticipantId: negevP2.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Snack Packs for Kids',
        category: 'food',
        quantity: 15,
        unit: 'pcs',
        status: 'pending',
        notes: 'Crackers, fruit pouches, cheese sticks',
        assignedParticipantId: negevP1.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Pita Bread',
        category: 'food',
        quantity: 3,
        unit: 'pack',
        status: 'pending',
        notes: 'For hummus and campfire meals',
      },
      {
        planId: negevPlan.planId,
        name: 'Hummus',
        category: 'food',
        quantity: 4,
        unit: 'pcs',
        status: 'pending',
        notes: 'Keep in cooler',
      },
      {
        planId: negevPlan.planId,
        name: 'Canned Beans & Corn',
        category: 'food',
        quantity: 6,
        unit: 'pcs',
        status: 'pending',
        notes: 'Easy campfire sides',
      },
      {
        planId: negevPlan.planId,
        name: 'Fruit (Apples, Bananas)',
        category: 'food',
        quantity: 3,
        unit: 'kg',
        status: 'pending',
        notes: 'Toddler-friendly snacks',
        assignedParticipantId: negevP3.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Eggs',
        category: 'food',
        quantity: 2,
        unit: 'pack',
        status: 'pending',
        notes: '30-count packs for breakfast',
        assignedParticipantId: negevP4.participantId,
      },
      {
        planId: negevPlan.planId,
        name: 'Sausages / Hot Dogs',
        category: 'food',
        quantity: 2,
        unit: 'pack',
        status: 'pending',
        notes: 'Campfire dinner',
        assignedParticipantId: negevOwner.participantId,
      },
    ])

    console.log('Created 27 items')

    console.log('\n--- Seed Summary ---')
    console.log('Plan ID:', negevPlan.planId)
    console.log('Title:', negevPlan.title)
    console.log('Owner:', negevOwner.name, negevOwner.lastName)
    console.log('Participants: 5')
    console.log('Items: 27 (19 equipment + 8 food)')
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
