import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Database = ReturnType<typeof drizzle<typeof schema>>

export function createDb(connectionString: string) {
  const client = postgres(connectionString)
  const db = drizzle(client, { schema })

  return {
    db,
    async close() {
      await client.end()
    },
  }
}

export { schema }
export * from './schema.js'
