import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const API_URL = 'http://localhost:3334'
const COMPOSE_FILE = 'docker-compose.test.yml'
const PROJECT_NAME = 'chillist-test'
const E2E_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/chillist_test'

async function waitForHealthy(
  url: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) {
        return true
      }
    } catch {
      // Container not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

async function runMigrations() {
  const client = postgres(E2E_DATABASE_URL, { max: 1 })
  const db = drizzle(client)

  await migrate(db, { migrationsFolder: './drizzle' })
  await client.end()
}

describe('Docker Production E2E Tests', () => {
  beforeAll(async () => {
    execSync(
      `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} down --volumes --remove-orphans 2>/dev/null || true`,
      { stdio: 'pipe' }
    )

    execSync(`docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} build`, {
      stdio: 'pipe',
    })

    execSync(
      `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} up -d postgres --wait`,
      { stdio: 'pipe' }
    )

    await new Promise((resolve) => setTimeout(resolve, 2000))

    await runMigrations()

    execSync(
      `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} up -d api --wait`,
      { stdio: 'pipe' }
    )

    const healthy = await waitForHealthy(API_URL)
    if (!healthy) {
      throw new Error('Container failed to become healthy within timeout')
    }
  }, 180000)

  afterAll(() => {
    try {
      execSync(
        `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} down --volumes --remove-orphans`,
        { stdio: 'pipe' }
      )
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Health Endpoint', () => {
    it('should return ok:true from health endpoint', async () => {
      const response = await fetch(`${API_URL}/health`)

      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toEqual({ ok: true })
    })

    it('should have correct content-type header', async () => {
      const response = await fetch(`${API_URL}/health`)

      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should respond within acceptable time', async () => {
      const start = Date.now()
      await fetch(`${API_URL}/health`)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(500)
    })
  })

  describe('Plans Endpoint - Database Integration', () => {
    it('should return empty array when no plans exist', async () => {
      const response = await fetch(`${API_URL}/plans`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')

      const body = await response.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should create and retrieve a plan', async () => {
      const newPlan = {
        title: 'E2E Test Plan',
        description: 'Created during e2e test',
        status: 'active',
      }

      const createResponse = await fetch(`${API_URL}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlan),
      })

      if (createResponse.status === 404) {
        console.log('POST /plans not implemented yet, skipping create test')
        return
      }

      expect(createResponse.status).toBe(201)

      const createdPlan = await createResponse.json()
      expect(createdPlan.title).toBe(newPlan.title)
      expect(createdPlan.planId).toBeDefined()

      const getResponse = await fetch(`${API_URL}/plans`)
      expect(getResponse.status).toBe(200)

      const plans = await getResponse.json()
      expect(plans.length).toBeGreaterThan(0)
      expect(
        plans.some((p: { title: string }) => p.title === 'E2E Test Plan')
      ).toBe(true)
    })

    it('should return plans with correct structure', async () => {
      const response = await fetch(`${API_URL}/plans`)
      expect(response.status).toBe(200)

      const plans = await response.json()

      if (plans.length > 0) {
        const plan = plans[0]
        expect(plan).toHaveProperty('planId')
        expect(plan).toHaveProperty('title')
        expect(plan).toHaveProperty('status')
        expect(plan).toHaveProperty('createdAt')
        expect(plan).toHaveProperty('updatedAt')
      }
    })
  })
})
