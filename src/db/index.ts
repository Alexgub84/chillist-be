import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

const connectionString = config.databaseUrl

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const client = postgres(connectionString)

export const db = drizzle(client, { schema })

export async function closeDb() {
  await client.end()
}

export { schema }
export * from './schema.js'
