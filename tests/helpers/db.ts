import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../../src/db/schema.js'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/chillist'

let client: ReturnType<typeof postgres> | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export async function setupTestDatabase() {
  if (db) return db

  client = postgres(TEST_DATABASE_URL, { max: 1 })
  db = drizzle(client, { schema })

  await migrate(db, { migrationsFolder: './drizzle' })

  return db
}

export async function getTestDb() {
  if (!db) {
    await setupTestDatabase()
  }
  return db!
}

export async function cleanupTestDatabase() {
  const testDb = await getTestDb()

  await testDb.delete(schema.itemAssignments)
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
