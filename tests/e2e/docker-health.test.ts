import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec, execSync, ChildProcess } from 'child_process'

const API_URL = 'http://localhost:3334'
const COMPOSE_FILE = 'docker-compose.test.yml'
const PROJECT_NAME = 'chillist-test'

async function waitForHealthy(
  url: string,
  maxAttempts: number = 30,
  intervalMs: number = 1000
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

describe('Docker Production Health Check', () => {
  let composeProcess: ChildProcess | null = null

  beforeAll(async () => {
    execSync(
      `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} build --quiet`,
      {
        stdio: 'pipe',
      }
    )

    composeProcess = exec(
      `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} up --wait`
    )

    const healthy = await waitForHealthy(API_URL)
    if (!healthy) {
      throw new Error('Container failed to become healthy within timeout')
    }
  }, 120000)

  afterAll(() => {
    try {
      execSync(
        `docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} down --volumes --remove-orphans`,
        {
          stdio: 'pipe',
        }
      )
    } catch {
      // Ignore cleanup errors
    }
    if (composeProcess) {
      composeProcess.kill()
    }
  })

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
