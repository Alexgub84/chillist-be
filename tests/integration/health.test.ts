import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'

describe('Health Route', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns { ok: true }', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })
})
