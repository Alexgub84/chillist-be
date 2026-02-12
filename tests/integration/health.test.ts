import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { setupTestDatabase, closeTestDatabase } from '../helpers/db.js'

describe('Health Route', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await setupTestDatabase()
    app = await buildApp({ db }, { logger: false })
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  it('GET /health returns healthy status with database connected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'healthy',
      database: 'connected',
    })
  })
})
