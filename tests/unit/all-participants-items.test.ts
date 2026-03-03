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
  assignItemToAllParticipants,
  reassignGroupToParticipant,
  unassignGroup,
  updateGroupCoreFields,
  createItemsForNewParticipant,
  removeParticipantFromAllGroups,
  NotOwnerError,
  ItemNotFoundError,
  NoGroupError,
} from '../../src/services/all-participants-items.service.js'

describe('All Participants Items Service', () => {
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

  describe('assignItemToAllParticipants', () => {
    it('flags original and creates N-1 copies on first assignment', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 4)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      const result = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      expect(result).toHaveLength(4)
      for (const r of result) {
        expect(r.isAllParticipants).toBe(true)
        expect(r.allParticipantsGroupId).toBe(result[0].allParticipantsGroupId)
        expect(r.name).toBe(item.name)
        expect(r.assignedParticipantId).toBeTruthy()
      }

      const assignedIds = result.map((r) => r.assignedParticipantId).sort()
      const expectedIds = planParticipants.map((p) => p.participantId).sort()
      expect(assignedIds).toEqual(expectedIds)

      const ownerItem = result.find(
        (r) => r.assignedParticipantId === owner.participantId
      )!
      expect(ownerItem.itemId).toBe(item.itemId)
    })

    it('throws NotOwnerError when called by non-owner', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      await expect(
        assignItemToAllParticipants(db, item.itemId, nonOwner.participantId)
      ).rejects.toThrow(NotOwnerError)
    })

    it('throws ItemNotFoundError for non-existent item', async () => {
      const fakeItemId = '00000000-0000-0000-0000-000000000001'
      const fakeOwnerId = '00000000-0000-0000-0000-000000000002'

      await expect(
        assignItemToAllParticipants(db, fakeItemId, fakeOwnerId)
      ).rejects.toThrow(ItemNotFoundError)
    })

    it('reconciles on re-toggle: revives canceled, creates for new participants', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      await assignItemToAllParticipants(db, item.itemId, owner.participantId)

      await unassignGroup(db, item.itemId)

      const testDb = await getTestDb()
      const [newParticipant] = await testDb
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'New',
          lastName: 'Person',
          contactPhone: '+1-555-999-9999',
          role: 'participant',
        })
        .returning()

      const result = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      expect(result).toHaveLength(4)
      const assignedIds = new Set(result.map((r) => r.assignedParticipantId))
      expect(assignedIds.has(newParticipant.participantId)).toBe(true)
      for (const r of result) {
        expect(r.isAllParticipants).toBe(true)
        expect(r.status).not.toBe('canceled')
      }
    })

    it('re-toggle preserves non-canceled statuses', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      const nonOwnerItem = group.find(
        (g) => g.assignedParticipantId === nonOwner.participantId
      )!

      await reassignGroupToParticipant(db, item.itemId, owner.participantId)

      const testDb = await getTestDb()
      await testDb
        .update(items)
        .set({ status: 'purchased' })
        .where(eq(items.itemId, nonOwnerItem.itemId))

      const result = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      const revivedNonOwner = result.find(
        (r) => r.assignedParticipantId === nonOwner.participantId
      )!
      expect(revivedNonOwner.status).toBe('purchased')
      expect(revivedNonOwner.isAllParticipants).toBe(true)
    })
  })

  describe('reassignGroupToParticipant', () => {
    it('cancels all siblings and reassigns target item', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const target = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )
      const groupId = group[0].allParticipantsGroupId!

      const updated = await reassignGroupToParticipant(
        db,
        item.itemId,
        target.participantId
      )

      expect(updated.isAllParticipants).toBe(false)
      expect(updated.assignedParticipantId).toBe(target.participantId)
      expect(updated.allParticipantsGroupId).toBe(groupId)

      const testDb = await getTestDb()
      const allGroupItems = await testDb
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))

      const siblings = allGroupItems.filter((i) => i.itemId !== item.itemId)
      for (const s of siblings) {
        expect(s.status).toBe('canceled')
        expect(s.isAllParticipants).toBe(false)
      }
    })

    it('throws NoGroupError for item without group', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      await expect(
        reassignGroupToParticipant(
          db,
          item.itemId,
          '00000000-0000-0000-0000-000000000001'
        )
      ).rejects.toThrow(NoGroupError)
    })
  })

  describe('unassignGroup', () => {
    it('cancels ALL items in the group', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 4)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )
      const groupId = group[0].allParticipantsGroupId!

      const count = await unassignGroup(db, item.itemId)

      expect(count).toBe(4)

      const testDb = await getTestDb()
      const allGroupItems = await testDb
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))

      for (const i of allGroupItems) {
        expect(i.status).toBe('canceled')
        expect(i.isAllParticipants).toBe(false)
      }
    })

    it('throws NoGroupError for item without group', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      await expect(unassignGroup(db, item.itemId)).rejects.toThrow(NoGroupError)
    })
  })

  describe('updateGroupCoreFields', () => {
    it('updates name/qty/unit across all copies in the group', async () => {
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

      const updatedCount = await updateGroupCoreFields(db, item.itemId, {
        name: 'Updated Tent',
        quantity: 5,
        unit: 'kg',
      })

      expect(updatedCount).toBe(3)

      const testDb = await getTestDb()
      const allGroupItems = await testDb
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))

      for (const i of allGroupItems) {
        expect(i.name).toBe('Updated Tent')
        expect(i.quantity).toBe(5)
        expect(i.unit).toBe('kg')
      }
    })

    it('does NOT update status across the group', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      const nonOwnerItem = group.find(
        (g) => g.assignedParticipantId === nonOwner.participantId
      )!
      const testDb = await getTestDb()
      await testDb
        .update(items)
        .set({ status: 'purchased' })
        .where(eq(items.itemId, nonOwnerItem.itemId))

      await updateGroupCoreFields(db, item.itemId, {
        name: 'New Name',
        status: 'packed',
      })

      const [refreshedNonOwner] = await testDb
        .select()
        .from(items)
        .where(eq(items.itemId, nonOwnerItem.itemId))

      expect(refreshedNonOwner.name).toBe('New Name')
      expect(refreshedNonOwner.status).toBe('purchased')
    })

    it('returns 0 for non-all-participants item', async () => {
      const [plan] = await seedTestPlans(1)
      const [item] = await seedTestItems(plan.planId, 1)

      const count = await updateGroupCoreFields(db, item.itemId, {
        name: 'New Name',
      })

      expect(count).toBe(0)
    })
  })

  describe('createItemsForNewParticipant', () => {
    it('creates copies from active groups for a new participant', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const planItems = await seedTestItems(plan.planId, 2)

      await assignItemToAllParticipants(
        db,
        planItems[0].itemId,
        owner.participantId
      )
      await assignItemToAllParticipants(
        db,
        planItems[1].itemId,
        owner.participantId
      )

      const testDb = await getTestDb()
      const [newParticipant] = await testDb
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'New',
          lastName: 'Person',
          contactPhone: '+1-555-888-8888',
          role: 'participant',
        })
        .returning()

      const created = await createItemsForNewParticipant(
        db,
        plan.planId,
        newParticipant.participantId
      )

      expect(created).toHaveLength(2)
      for (const c of created) {
        expect(c.assignedParticipantId).toBe(newParticipant.participantId)
        expect(c.isAllParticipants).toBe(true)
        expect(c.status).toBe('pending')
      }
    })

    it('skips canceled groups', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const planItems = await seedTestItems(plan.planId, 2)

      await assignItemToAllParticipants(
        db,
        planItems[0].itemId,
        owner.participantId
      )
      await assignItemToAllParticipants(
        db,
        planItems[1].itemId,
        owner.participantId
      )

      await unassignGroup(db, planItems[0].itemId)

      const testDb = await getTestDb()
      const [newParticipant] = await testDb
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'New',
          lastName: 'Person',
          contactPhone: '+1-555-777-7777',
          role: 'participant',
        })
        .returning()

      const created = await createItemsForNewParticipant(
        db,
        plan.planId,
        newParticipant.participantId
      )

      expect(created).toHaveLength(1)
      expect(created[0].name).toBe(planItems[1].name)
    })

    it('is idempotent — calling twice does not create duplicates', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      await assignItemToAllParticipants(db, item.itemId, owner.participantId)

      const testDb = await getTestDb()
      const [newParticipant] = await testDb
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'New',
          lastName: 'Person',
          contactPhone: '+1-555-666-6666',
          role: 'participant',
        })
        .returning()

      const first = await createItemsForNewParticipant(
        db,
        plan.planId,
        newParticipant.participantId
      )
      const second = await createItemsForNewParticipant(
        db,
        plan.planId,
        newParticipant.participantId
      )

      expect(first).toHaveLength(1)
      expect(second).toHaveLength(0)
    })
  })

  describe('removeParticipantFromAllGroups', () => {
    it('hard deletes only all-participants copies for the participant', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const target = planParticipants.find((p) => p.role === 'participant')!
      const planItems = await seedTestItems(plan.planId, 2)

      await assignItemToAllParticipants(
        db,
        planItems[0].itemId,
        owner.participantId
      )

      const testDb = await getTestDb()
      await testDb
        .update(items)
        .set({ assignedParticipantId: target.participantId })
        .where(eq(items.itemId, planItems[1].itemId))

      const deletedCount = await removeParticipantFromAllGroups(
        db,
        target.participantId
      )

      expect(deletedCount).toBe(1)

      const remaining = await testDb
        .select()
        .from(items)
        .where(eq(items.assignedParticipantId, target.participantId))

      expect(remaining).toHaveLength(1)
      expect(remaining[0].itemId).toBe(planItems[1].itemId)
      expect(remaining[0].isAllParticipants).toBe(false)
    })

    it('returns 0 when participant has no all-participants items', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const nonOwner = planParticipants.find((p) => p.role === 'participant')!

      const count = await removeParticipantFromAllGroups(
        db,
        nonOwner.participantId
      )

      expect(count).toBe(0)
    })
  })
})
