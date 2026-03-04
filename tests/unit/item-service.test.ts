import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  setupTestDatabase,
  closeTestDatabase,
  cleanupTestDatabase,
  seedTestPlans,
  seedTestParticipants,
  seedTestItems,
  getTestDb,
} from '../helpers/db.js'
import { items, participants } from '../../src/db/schema.js'
import { Database } from '../../src/db/index.js'
import {
  checkPlanExists,
  validateParticipant,
  batchValidateParticipants,
  findPlanOwner,
  applyAllParticipantsUpdate,
  createItemAssignedToAll,
} from '../../src/services/item.service.js'
import {
  assignItemToAllParticipants,
  unassignGroup,
} from '../../src/services/all-participants-items.service.js'

describe('Item Service', () => {
  let db: Database

  beforeAll(async () => {
    db = await setupTestDatabase()
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  describe('checkPlanExists', () => {
    it('returns true for existing plan', async () => {
      const [plan] = await seedTestPlans(1)
      expect(await checkPlanExists(db, plan.planId)).toBe(true)
    })

    it('returns false for non-existent plan', async () => {
      expect(
        await checkPlanExists(db, '00000000-0000-0000-0000-000000000099')
      ).toBe(false)
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

    it('includes participants from different plans', async () => {
      const [planA, planB] = await seedTestPlans(2)
      const pA = await seedTestParticipants(planA.planId, 1)
      const pB = await seedTestParticipants(planB.planId, 1)

      const ids = [pA[0].participantId, pB[0].participantId]
      const map = await batchValidateParticipants(db, ids)

      expect(map.get(pA[0].participantId)).toBe(planA.planId)
      expect(map.get(pB[0].participantId)).toBe(planB.planId)
    })
  })

  describe('findPlanOwner', () => {
    it('returns owner participantId when plan has an owner', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!

      const result = await findPlanOwner(db, plan.planId)
      expect(result).toBe(owner.participantId)
    })

    it('returns null when plan has no participants', async () => {
      const [plan] = await seedTestPlans(1)
      const result = await findPlanOwner(db, plan.planId)
      expect(result).toBeNull()
    })

    it('returns null for non-existent plan', async () => {
      const result = await findPlanOwner(
        db,
        '00000000-0000-0000-0000-000000000099'
      )
      expect(result).toBeNull()
    })
  })

  describe('applyAllParticipantsUpdate', () => {
    it('assigns to all when assignedToAll=true', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 3)
      const [item] = await seedTestItems(plan.planId, 1)

      const result = await applyAllParticipantsUpdate(
        db,
        item.itemId,
        item,
        true,
        {},
        async () => ({ valid: true })
      )

      expect(result).not.toBeNull()
      expect(result!.item.isAllParticipants).toBe(true)
      expect(result!.item.allParticipantsGroupId).toBeTruthy()

      const allGroupItems = await db
        .select()
        .from(items)
        .where(
          eq(items.allParticipantsGroupId, result!.item.allParticipantsGroupId!)
        )
      expect(allGroupItems).toHaveLength(3)
    })

    it('reassigns group to specific participant', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const target = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      await assignItemToAllParticipants(db, item.itemId, owner.participantId)

      const [existing] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))

      const result = await applyAllParticipantsUpdate(
        db,
        item.itemId,
        existing,
        undefined,
        { assignedParticipantId: target.participantId },
        async () => ({ valid: true })
      )

      expect(result).not.toBeNull()
      expect(result!.item.isAllParticipants).toBe(false)
      expect(result!.item.assignedParticipantId).toBe(target.participantId)
    })

    it('unassigns group when assignedParticipantId is null', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )
      const groupId = group[0].allParticipantsGroupId!

      const [existing] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))

      const result = await applyAllParticipantsUpdate(
        db,
        item.itemId,
        existing,
        undefined,
        { assignedParticipantId: null },
        async () => ({ valid: true })
      )

      expect(result).not.toBeNull()
      expect(result!.item.status).toBe('canceled')

      const allGroupItems = await db
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))
      expect(allGroupItems.every((i) => i.status === 'canceled')).toBe(true)
    })

    it('unassigns group when assignedToAll=false', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 3)
      const [item] = await seedTestItems(plan.planId, 1)

      await applyAllParticipantsUpdate(
        db,
        item.itemId,
        item,
        true,
        {},
        async () => ({ valid: true })
      )

      const [existing] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))

      const result = await applyAllParticipantsUpdate(
        db,
        item.itemId,
        existing,
        false,
        {},
        async () => ({ valid: true })
      )

      expect(result).not.toBeNull()
      expect(result!.item.status).toBe('canceled')
      expect(result!.item.isAllParticipants).toBe(false)
    })

    it('cascades core field updates to all copies', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )
      const groupId = group[0].allParticipantsGroupId!

      const [existing] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))

      await applyAllParticipantsUpdate(
        db,
        item.itemId,
        existing,
        undefined,
        { name: 'Renamed Item', quantity: 10 },
        async () => ({ valid: true })
      )

      const allGroupItems = await db
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))
      for (const gi of allGroupItems) {
        expect(gi.name).toBe('Renamed Item')
        expect(gi.quantity).toBe(10)
      }
    })

    it('applies status update only to the target item', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )
      const sibling = group.find((g) => g.itemId !== item.itemId)!

      const [existing] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))

      await applyAllParticipantsUpdate(
        db,
        item.itemId,
        existing,
        undefined,
        { status: 'purchased' },
        async () => ({ valid: true })
      )

      const [refreshedTarget] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))
      expect(refreshedTarget.status).toBe('purchased')

      const [refreshedSibling] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, sibling.itemId))
      expect(refreshedSibling.status).toBe('pending')
    })

    it('returns null for normal (non-all-participants) item with no assignedToAll flag', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const result = await applyAllParticipantsUpdate(
        db,
        item.itemId,
        item,
        undefined,
        { name: 'Updated' },
        async () => ({ valid: true })
      )

      expect(result).toBeNull()
    })

    it('throws when participant validator fails during reassignment', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      await assignItemToAllParticipants(db, item.itemId, owner.participantId)

      const [existing] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, item.itemId))

      await expect(
        applyAllParticipantsUpdate(
          db,
          item.itemId,
          existing,
          undefined,
          { assignedParticipantId: '00000000-0000-0000-0000-000000000099' },
          async () => ({ valid: false, message: 'Participant not found' })
        )
      ).rejects.toThrow('Participant not found')
    })
  })

  describe('createItemAssignedToAll', () => {
    it('creates copies for all participants', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await createItemAssignedToAll(db, item.itemId, plan.planId)

      expect(group).not.toBeNull()
      expect(group!).toHaveLength(3)

      const assignedIds = group!.map((g) => g.assignedParticipantId).sort()
      const expectedIds = planParticipants.map((p) => p.participantId).sort()
      expect(assignedIds).toEqual(expectedIds)
    })

    it('returns null when plan has no owner', async () => {
      const [plan] = await seedTestPlans(1)
      const testDb = await getTestDb()
      await testDb.insert(participants).values({
        planId: plan.planId,
        name: 'Non',
        lastName: 'Owner',
        contactPhone: '+1-555-000-0001',
        role: 'participant',
      })
      const [item] = await seedTestItems(plan.planId, 1)

      const result = await createItemAssignedToAll(db, item.itemId, plan.planId)
      expect(result).toBeNull()
    })

    it('works after unassign and re-create', async () => {
      const [plan] = await seedTestPlans(1)
      await seedTestParticipants(plan.planId, 3)
      const [item] = await seedTestItems(plan.planId, 1)

      const first = await createItemAssignedToAll(db, item.itemId, plan.planId)
      expect(first).toHaveLength(3)

      await unassignGroup(db, item.itemId)

      const second = await createItemAssignedToAll(db, item.itemId, plan.planId)
      expect(second).not.toBeNull()
      expect(second!).toHaveLength(3)
      expect(second!.every((g) => g.isAllParticipants)).toBe(true)
    })
  })
})
