import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestPlans,
  seedTestJoinRequests,
  setupTestDatabase,
} from '../helpers/db.js'

describe('participant_join_requests schema', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  it('migration applies and table is accessible', async () => {
    const [plan] = await seedTestPlans(1)
    const userId = 'aaaaaaaa-1111-2222-3333-444444444444'
    const joinRequest = await seedTestJoinRequests(plan.planId, userId)

    expect(joinRequest.requestId).toBeDefined()
    expect(joinRequest.planId).toBe(plan.planId)
    expect(joinRequest.supabaseUserId).toBe(userId)
    expect(joinRequest.name).toBe('TestFirst')
    expect(joinRequest.lastName).toBe('TestLast')
    expect(joinRequest.contactPhone).toBe('+15550000000')
    expect(joinRequest.status).toBe('pending')
  })

  it('unique constraint prevents duplicate planId+supabaseUserId', async () => {
    const [plan] = await seedTestPlans(1)
    const userId = 'bbbbbbbb-1111-2222-3333-444444444444'
    await seedTestJoinRequests(plan.planId, userId)

    await expect(seedTestJoinRequests(plan.planId, userId)).rejects.toThrow()
  })

  it('seedTestJoinRequests accepts overrides', async () => {
    const [plan] = await seedTestPlans(1)
    const joinRequest = await seedTestJoinRequests(
      plan.planId,
      'cccccccc-1111-2222-3333-444444444444',
      {
        name: 'Custom',
        lastName: 'Name',
        contactPhone: '+15559999999',
        status: 'rejected',
        foodPreferences: 'vegan',
      }
    )

    expect(joinRequest.name).toBe('Custom')
    expect(joinRequest.lastName).toBe('Name')
    expect(joinRequest.status).toBe('rejected')
    expect(joinRequest.foodPreferences).toBe('vegan')
  })
})
