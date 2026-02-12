import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import * as schema from '../../src/db/schema.js'
import { Database } from '../../src/db/index.js'

let container: StartedPostgreSqlContainer | null = null
let client: ReturnType<typeof postgres> | null = null
let db: Database | null = null

export async function setupTestDatabase(): Promise<Database> {
  if (db) return db

  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('chillist_test')
    .start()

  const connectionString = container.getConnectionUri()
  client = postgres(connectionString, { max: 1 })
  db = drizzle(client, { schema })

  await migrate(db, { migrationsFolder: './drizzle' })

  return db
}

export async function getTestDb(): Promise<Database> {
  if (!db) {
    await setupTestDatabase()
  }
  return db!
}

export async function cleanupTestDatabase() {
  const testDb = await getTestDb()

  await testDb.delete(schema.items)
  await testDb.delete(schema.participants)
  await testDb.delete(schema.plans)
}

export async function closeTestDatabase() {
  if (client) {
    await client.end()
    client = null
    db = null
  }

  if (container) {
    await container.stop()
    container = null
  }
}

export async function seedTestPlans(count: number = 3) {
  const testDb = await getTestDb()

  const testPlans = Array.from({ length: count }, (_, i) => ({
    title: `Test Plan ${i + 1}`,
    description: `Description for test plan ${i + 1}`,
    status: 'active' as const,
    visibility: 'public' as const,
  }))

  const inserted = await testDb
    .insert(schema.plans)
    .values(testPlans)
    .returning()
  return inserted
}

export async function seedTestItems(
  planId: string,
  count: number = 3
): Promise<schema.Item[]> {
  const testDb = await getTestDb()

  const testItems = Array.from({ length: count }, (_, i) => ({
    planId,
    name: `Test Item ${i + 1}`,
    category: 'equipment' as const,
    quantity: i + 1,
    unit: 'pcs' as const,
    status: 'pending' as const,
    notes: i % 2 === 0 ? `Notes for item ${i + 1}` : null,
  }))

  const inserted = await testDb
    .insert(schema.items)
    .values(testItems)
    .returning()
  return inserted
}

export async function seedTestParticipants(
  planId: string,
  count: number = 3
): Promise<schema.Participant[]> {
  const testDb = await getTestDb()

  const testParticipants = Array.from({ length: count }, (_, i) => ({
    planId,
    name: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    contactPhone: `+1-555-000-000${i + 1}`,
    displayName: `Participant ${i + 1}`,
    role: (i === 0 ? 'owner' : 'participant') as
      | 'owner'
      | 'participant'
      | 'viewer',
  }))

  const inserted = await testDb
    .insert(schema.participants)
    .values(testParticipants)
    .returning()
  return inserted
}
