import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  setupTestDatabase,
  closeTestDatabase,
  cleanupTestDatabase,
  seedTestPlans,
  seedTestParticipants,
  seedTestItems,
  seedTestParticipantWithUser,
} from '../helpers/db.js'
import { items } from '../../src/db/schema.js'
import { Database } from '../../src/db/index.js'
import {
  checkPlanExists,
  checkItemMutationAccess,
  canEditItem,
  validateParticipant,
  batchValidateParticipants,
  getPlanParticipantIds,
  persistAssignments,
  removeParticipantFromAssignments,
  addParticipantToAllFlaggedItems,
} from '../../src/services/item.service.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('Item Service', () => {
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
  }, 60000)

  afterAll(async () => {
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  describe('checkPlanExists', () => {
    it('returns true for existing plan', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestItems(plan.planId, 1)
      expect(await checkPlanExists(db, plan.planId)).toBe(true)
    })

    it('returns false for non-existent plan', async () => {
      expect(
        await checkPlanExists(db, '00000000-0000-0000-0000-000000000099')
      ).toBe(false)
    })
  })

  describe('checkItemMutationAccess', () => {
    it('returns not allowed for null user', async () => {
      const [plan] = await seedTestPlans(1)
      const result = await checkItemMutationAccess(db, plan.planId, null)
      expect(result.allowed).toBe(false)
    })

    it('returns allowed for admin user', async () => {
      const [plan] = await seedTestPlans(1)
      const result = await checkItemMutationAccess(db, plan.planId, {
        id: TEST_USER_ID,
        email: 'admin@test.com',
        role: 'admin',
      })
      expect(result.allowed).toBe(true)
      expect(result.participant).toBeNull()
    })

    it('returns allowed for owner participant', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 3, {
        ownerUserId: TEST_USER_ID,
      })

      const result = await checkItemMutationAccess(db, plan.planId, {
        id: TEST_USER_ID,
        email: 'test@test.com',
        role: 'authenticated',
      })
      expect(result.allowed).toBe(true)
      expect(result.participant?.role).toBe('owner')
    })

    it('returns allowed for regular participant', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 2)
      await seedTestParticipantWithUser(plan.planId, TEST_USER_ID)

      const result = await checkItemMutationAccess(db, plan.planId, {
        id: TEST_USER_ID,
        email: 'test@test.com',
        role: 'authenticated',
      })
      expect(result.allowed).toBe(true)
      expect(result.participant?.role).toBe('participant')
    })

    it('returns not allowed for viewer', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipantWithUser(plan.planId, TEST_USER_ID, {
        role: 'viewer',
      })

      const result = await checkItemMutationAccess(db, plan.planId, {
        id: TEST_USER_ID,
        email: 'test@test.com',
        role: 'authenticated',
      })
      expect(result.allowed).toBe(false)
    })

    it('returns not allowed for user not in plan', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 2)

      const result = await checkItemMutationAccess(db, plan.planId, {
        id: TEST_USER_ID,
        email: 'test@test.com',
        role: 'authenticated',
      })
      expect(result.allowed).toBe(false)
    })

    it('returns not allowed for non-existent plan', async () => {
      const result = await checkItemMutationAccess(
        db,
        '00000000-0000-0000-0000-000000000099',
        {
          id: TEST_USER_ID,
          email: 'test@test.com',
          role: 'authenticated',
        }
      )
      expect(result.allowed).toBe(false)
    })
  })

  describe('canEditItem', () => {
    it('owner can always edit', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      const result = canEditItem(
        {
          allowed: true,
          participant: { participantId: owner.participantId, role: 'owner' },
        },
        item
      )
      expect(result).toBe(true)
    })

    it('participant can edit if they are in assignmentStatusList', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      const assignedItem = {
        ...item,
        assignmentStatusList: [
          { participantId: nonOwner.participantId, status: 'pending' as const },
        ],
      }

      const result = canEditItem(
        {
          allowed: true,
          participant: {
            participantId: nonOwner.participantId,
            role: 'participant',
          },
        },
        assignedItem
      )
      expect(result).toBe(true)
    })

    it('participant can edit unassigned items', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      const unassignedItem = { ...item, assignmentStatusList: [] }

      const result = canEditItem(
        {
          allowed: true,
          participant: {
            participantId: nonOwner.participantId,
            role: 'participant',
          },
        },
        unassignedItem
      )
      expect(result).toBe(true)
    })

    it('participant cannot edit items assigned to others', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!
      const other = planParticipants.filter((p) => p.role === 'participant')[1]
      const [item] = await seedTestItems(plan.planId, 1)

      const assignedItem = {
        ...item,
        assignmentStatusList: [
          { participantId: other.participantId, status: 'pending' as const },
        ],
      }

      const result = canEditItem(
        {
          allowed: true,
          participant: {
            participantId: nonOwner.participantId,
            role: 'participant',
          },
        },
        assignedItem
      )
      expect(result).toBe(false)
    })
  })

  describe('validateParticipant', () => {
    it('returns valid for participant belonging to the plan', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)

      const result = await validateParticipant(
        db,
        planParticipants[0].participantId,
        plan.planId
      )
      expect(result).toEqual({ valid: true })
    })

    it('returns invalid for non-existent participant', async () => {
      const [plan] = await seedTestPlans(1)
      const result = await validateParticipant(
        db,
        '00000000-0000-0000-0000-000000000099',
        plan.planId
      )
      expect(result.valid).toBe(false)
      expect(result.message).toBe('Participant not found')
    })

    it('returns invalid when participant belongs to a different plan', async () => {
      const [planA, planB] = await seedTestPlans(2)
      const participantsA = await seedTestParticipants(planA.planId, 2)

      const result = await validateParticipant(
        db,
        participantsA[0].participantId,
        planB.planId
      )
      expect(result.valid).toBe(false)
      expect(result.message).toBe('Participant does not belong to this plan')
    })
  })

  describe('batchValidateParticipants', () => {
    it('returns map of participantId to planId for found participants', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)

      const ids = planParticipants.map((p) => p.participantId)
      const map = await batchValidateParticipants(db, ids)

      expect(map.size).toBe(3)
      for (const p of planParticipants) {
        expect(map.get(p.participantId)).toBe(plan.planId)
      }
    })

    it('returns empty map for empty input', async () => {
      const map = await batchValidateParticipants(db, [])
      expect(map.size).toBe(0)
    })

    it('omits non-existent participants from the map', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)

      const ids = [
        planParticipants[0].participantId,
        '00000000-0000-0000-0000-000000000099',
      ]
      const map = await batchValidateParticipants(db, ids)

      expect(map.size).toBe(1)
      expect(map.has(planParticipants[0].participantId)).toBe(true)
      expect(map.has('00000000-0000-0000-0000-000000000099')).toBe(false)
    })
  })

  describe('getPlanParticipantIds', () => {
    it('returns participant ids for plan', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)

      const ids = await getPlanParticipantIds(db, plan.planId)
      expect(ids).toHaveLength(3)
      expect(ids.sort()).toEqual(
        planParticipants.map((p) => p.participantId).sort()
      )
    })

    it('returns empty array for plan with no participants', async () => {
      const [plan] = await seedTestPlans(1)
      const ids = await getPlanParticipantIds(db, plan.planId)
      expect(ids).toEqual([])
    })
  })

  describe('persistAssignments', () => {
    it('updates assignmentStatusList and isAllParticipants', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const [item] = await seedTestItems(plan.planId, 1)

      const assignmentStatusList = [
        {
          participantId: planParticipants[0].participantId,
          status: 'pending' as const,
        },
        {
          participantId: planParticipants[1].participantId,
          status: 'purchased' as const,
        },
      ]

      const updated = await persistAssignments(
        db,
        item.itemId,
        assignmentStatusList,
        true
      )

      expect(updated.assignmentStatusList).toEqual(assignmentStatusList)
      expect(updated.isAllParticipants).toBe(true)
    })
  })

  describe('removeParticipantFromAssignments', () => {
    it('removes participant from items that have them assigned', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const [item] = await seedTestItems(plan.planId, 1)

      await db
        .update(items)
        .set({
          assignmentStatusList: [
            {
              participantId: planParticipants[0].participantId,
              status: 'pending',
            },
            {
              participantId: planParticipants[1].participantId,
              status: 'pending',
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(items.itemId, item.itemId))

      const count = await removeParticipantFromAssignments(
        db,
        plan.planId,
        planParticipants[0].participantId
      )

      expect(count).toBe(1)

      const [updated] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(updated.assignmentStatusList).toHaveLength(1)
      expect(
        (updated.assignmentStatusList as { participantId: string }[])[0]
          .participantId
      ).toBe(planParticipants[1].participantId)
    })

    it('returns 0 when participant is not assigned to any items', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      await seedTestItems(plan.planId, 1)

      const count = await removeParticipantFromAssignments(
        db,
        plan.planId,
        planParticipants[0].participantId
      )
      expect(count).toBe(0)
    })
  })

  describe('addParticipantToAllFlaggedItems', () => {
    it('adds participant to items with isAllParticipants=true', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const [item] = await seedTestItems(plan.planId, 1)

      await db
        .update(items)
        .set({
          isAllParticipants: true,
          assignmentStatusList: [
            {
              participantId: planParticipants[0].participantId,
              status: 'pending',
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(items.itemId, item.itemId))

      const count = await addParticipantToAllFlaggedItems(
        db,
        plan.planId,
        planParticipants[1].participantId
      )

      expect(count).toBe(1)

      const [updated] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))
      const list = updated.assignmentStatusList as { participantId: string }[]
      expect(list).toHaveLength(2)
      expect(list.map((a) => a.participantId)).toContain(
        planParticipants[1].participantId
      )
    })

    it('returns 0 when participant already in assignmentStatusList', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const [item] = await seedTestItems(plan.planId, 1)

      await db
        .update(items)
        .set({
          isAllParticipants: true,
          assignmentStatusList: [
            {
              participantId: planParticipants[0].participantId,
              status: 'pending',
            },
            {
              participantId: planParticipants[1].participantId,
              status: 'pending',
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(items.itemId, item.itemId))

      const count = await addParticipantToAllFlaggedItems(
        db,
        plan.planId,
        planParticipants[1].participantId
      )
      expect(count).toBe(0)
    })
  })
})
