import { beforeAll, afterAll } from 'vitest'
import { setupTestDatabase, closeTestDatabase } from './db.js'

beforeAll(async () => {
  await setupTestDatabase()
})

afterAll(async () => {
  await closeTestDatabase()
})
