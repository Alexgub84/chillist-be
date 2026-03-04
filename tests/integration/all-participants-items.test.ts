import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import {
  cleanupTestDatabase,
  closeTestDatabase,
  seedTestItems,
  seedTestParticipants,
  seedTestPlans,
  setupTestDatabase,
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
} from '../../src/services/all-participants-items.service.js'
import { addParticipantToPlan } from '../../src/services/participant.service.js'
import {
  setupTestKeys,
  getTestJWKS,
  getTestIssuer,
  signTestJwt,
} from '../helpers/auth.js'

const TEST_USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('All Participants Items — Integration', () => {
  let app: FastifyInstance
  let db: Database
  let token: string

  beforeAll(async () => {
    db = await setupTestDatabase()
    await setupTestKeys()
    token = await signTestJwt({ sub: TEST_USER_ID })
    app = await buildApp(
      { db },
      {
        logger: false,
        auth: { jwks: getTestJWKS(), issuer: getTestIssuer() },
      }
    )
  })

  afterAll(async () => {
    await app.close()
    await closeTestDatabase()
  })

  beforeEach(async () => {
    await cleanupTestDatabase()
  })

  describe('Full lifecycle: assign all → status updates → reassign to one', () => {
    it('participants update their own statuses independently, then owner reassigns to one', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 4)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const others = planParticipants.filter((p) => p.role !== 'owner')
      const [item] = await seedTestItems(plan.planId, 1)

      const group = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )
      expect(group).toHaveLength(4)

      const ownerCopy = group.find(
        (g) => g.assignedParticipantId === owner.participantId
      )!
      const p1Copy = group.find(
        (g) => g.assignedParticipantId === others[0].participantId
      )!
      await db
        .update(items)
        .set({ status: 'purchased' })
        .where(eq(items.itemId, ownerCopy.itemId))
      await db
        .update(items)
        .set({ status: 'packed' })
        .where(eq(items.itemId, p1Copy.itemId))

      const reassigned = await reassignGroupToParticipant(
        db,
        item.itemId,
        others[1].participantId
      )

      expect(reassigned.assignedParticipantId).toBe(others[1].participantId)
      expect(reassigned.isAllParticipants).toBe(false)

      const allItems = await db
        .select()
        .from(items)
        .where(
          eq(items.allParticipantsGroupId, group[0].allParticipantsGroupId!)
        )
      const active = allItems.filter((i) => i.status !== 'canceled')
      const canceled = allItems.filter((i) => i.status === 'canceled')

      expect(active).toHaveLength(1)
      expect(active[0].itemId).toBe(item.itemId)
      expect(canceled).toHaveLength(3)
    })
  })

  describe('Full lifecycle: assign all → unassign → re-toggle', () => {
    it('unassign cancels all, re-toggle revives with correct statuses', async () => {
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
      const groupId = group[0].allParticipantsGroupId!

      const nonOwnerCopy = group.find(
        (g) => g.assignedParticipantId === nonOwner.participantId
      )!
      await db
        .update(items)
        .set({ status: 'purchased' })
        .where(eq(items.itemId, nonOwnerCopy.itemId))

      const canceledCount = await unassignGroup(db, item.itemId)
      expect(canceledCount).toBe(3)

      const afterUnassign = await db
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))
      expect(afterUnassign.every((i) => i.status === 'canceled')).toBe(true)
      expect(afterUnassign.every((i) => !i.isAllParticipants)).toBe(true)

      const revived = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      expect(revived).toHaveLength(3)
      expect(revived.every((r) => r.isAllParticipants)).toBe(true)

      const revivedCanceled = revived.filter((r) => r.status === 'canceled')
      expect(revivedCanceled).toHaveLength(0)
    })
  })

  describe('New participant auto-assignment via addParticipantToPlan', () => {
    it('addParticipantToPlan creates copies of all active "all" items for the new joiner', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const existingParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = existingParticipants.find((p) => p.role === 'owner')!
      const planItems = await seedTestItems(plan.planId, 3)

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

      const newParticipant = await addParticipantToPlan(db, {
        planId: plan.planId,
        userId: 'cccccccc-1111-2222-3333-444444444444',
        name: 'New',
        lastName: 'Joiner',
        contactPhone: '+1-555-999-0000',
      })

      const newItems = await db
        .select()
        .from(items)
        .where(eq(items.assignedParticipantId, newParticipant.participantId))

      const allCopies = newItems.filter((i) => i.isAllParticipants)
      expect(allCopies).toHaveLength(2)

      const names = allCopies.map((c) => c.name).sort()
      expect(names).toEqual([planItems[0].name, planItems[1].name].sort())
    })
  })

  describe('Participant deletion cleans up "all" copies', () => {
    it('deleting participant via route removes their "all" copies but keeps regular items', async () => {
      const [plan] = await seedTestPlans(1, { createdByUserId: TEST_USER_ID })
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const target = planParticipants.find((p) => p.role === 'participant')!

      const planItems = await seedTestItems(plan.planId, 2)
      await assignItemToAllParticipants(
        db,
        planItems[0].itemId,
        owner.participantId
      )

      await db
        .update(items)
        .set({ assignedParticipantId: target.participantId })
        .where(eq(items.itemId, planItems[1].itemId))

      const beforeDelete = await db
        .select()
        .from(items)
        .where(eq(items.assignedParticipantId, target.participantId))
      expect(beforeDelete).toHaveLength(2)

      const response = await app.inject({
        method: 'DELETE',
        url: `/participants/${target.participantId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)

      const afterDelete = await db
        .select()
        .from(items)
        .where(eq(items.planId, plan.planId))

      const targetItems = afterDelete.filter(
        (i) => i.assignedParticipantId === target.participantId
      )
      expect(targetItems).toHaveLength(0)

      const regularItem = afterDelete.find(
        (i) => i.itemId === planItems[1].itemId
      )
      expect(regularItem).toBeDefined()
      expect(regularItem!.assignedParticipantId).toBeNull()

      const allGroupItems = afterDelete.filter((i) => i.isAllParticipants)
      const allGroupParticipantIds = allGroupItems.map(
        (i) => i.assignedParticipantId
      )
      expect(allGroupParticipantIds).not.toContain(target.participantId)
    })
  })

  describe('Multiple "all" groups in same plan', () => {
    it('two separate all-items groups coexist independently', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const planItems = await seedTestItems(plan.planId, 2)

      const group1 = await assignItemToAllParticipants(
        db,
        planItems[0].itemId,
        owner.participantId
      )
      const group2 = await assignItemToAllParticipants(
        db,
        planItems[1].itemId,
        owner.participantId
      )

      expect(group1[0].allParticipantsGroupId).not.toBe(
        group2[0].allParticipantsGroupId
      )
      expect(group1).toHaveLength(3)
      expect(group2).toHaveLength(3)

      await unassignGroup(db, planItems[0].itemId)

      const g1Items = await db
        .select()
        .from(items)
        .where(
          eq(items.allParticipantsGroupId, group1[0].allParticipantsGroupId!)
        )
      expect(g1Items.every((i) => i.status === 'canceled')).toBe(true)

      const g2Items = await db
        .select()
        .from(items)
        .where(
          eq(items.allParticipantsGroupId, group2[0].allParticipantsGroupId!)
        )
      expect(g2Items.every((i) => i.status !== 'canceled')).toBe(true)
      expect(g2Items.every((i) => i.isAllParticipants)).toBe(true)
    })
  })

  describe('Cross-plan isolation', () => {
    it('assign-all in plan A does not affect plan B items', async () => {
      const [planA, planB] = await seedTestPlans(2)
      const participantsA = await seedTestParticipants(planA.planId, 3)
      await seedTestParticipants(planB.planId, 2)
      const ownerA = participantsA.find((p) => p.role === 'owner')!

      const itemsA = await seedTestItems(planA.planId, 1)
      await seedTestItems(planB.planId, 2)

      await assignItemToAllParticipants(
        db,
        itemsA[0].itemId,
        ownerA.participantId
      )

      const planBItems = await db
        .select()
        .from(items)
        .where(eq(items.planId, planB.planId))

      expect(planBItems).toHaveLength(2)
      expect(planBItems.every((i) => !i.isAllParticipants)).toBe(true)
      expect(planBItems.every((i) => i.allParticipantsGroupId === null)).toBe(
        true
      )
    })
  })

  describe('Core field sync across group', () => {
    it('owner updates name and quantity — all copies receive the change', async () => {
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

      await updateGroupCoreFields(db, item.itemId, {
        name: 'Large Tent',
        quantity: 3,
        notes: 'Bring extra stakes',
      })

      const updated = await db
        .select()
        .from(items)
        .where(eq(items.allParticipantsGroupId, groupId))

      expect(updated).toHaveLength(4)
      for (const u of updated) {
        expect(u.name).toBe('Large Tent')
        expect(u.quantity).toBe(3)
        expect(u.notes).toBe('Bring extra stakes')
      }
    })

    it('core field update does not touch individual statuses', async () => {
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

      const nonOwnerCopy = group.find(
        (g) => g.assignedParticipantId === nonOwner.participantId
      )!
      await db
        .update(items)
        .set({ status: 'packed' })
        .where(eq(items.itemId, nonOwnerCopy.itemId))

      await updateGroupCoreFields(db, item.itemId, { name: 'Renamed' })

      const [refreshed] = await db
        .select()
        .from(items)
        .where(eq(items.itemId, nonOwnerCopy.itemId))

      expect(refreshed.name).toBe('Renamed')
      expect(refreshed.status).toBe('packed')
    })
  })

  describe('GET /plans/:planId/items returns new fields', () => {
    it('items response includes isAllParticipants and allParticipantsGroupId', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 2)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const [item] = await seedTestItems(plan.planId, 1)

      await assignItemToAllParticipants(db, item.itemId, owner.participantId)

      const response = await app.inject({
        method: 'GET',
        url: `/plans/${plan.planId}/items`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const responseItems = response.json()

      expect(responseItems.length).toBeGreaterThanOrEqual(2)
      const allCopies = responseItems.filter(
        (i: { isAllParticipants: boolean }) => i.isAllParticipants
      )
      expect(allCopies.length).toBe(2)
      expect(allCopies[0].allParticipantsGroupId).toBeTruthy()
      expect(allCopies[0].allParticipantsGroupId).toBe(
        allCopies[1].allParticipantsGroupId
      )
    })
  })

  describe('Complex re-toggle with participant roster changes', () => {
    it('assign all → unassign → add participant → remove participant → re-toggle includes new, excludes removed', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const toRemove = planParticipants.find((p) => p.role === 'participant')!
      const [item] = await seedTestItems(plan.planId, 1)

      await assignItemToAllParticipants(db, item.itemId, owner.participantId)

      await unassignGroup(db, item.itemId)

      const [newParticipant] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Late',
          lastName: 'Joiner',
          contactPhone: '+1-555-111-2222',
          role: 'participant',
        })
        .returning()

      await removeParticipantFromAllGroups(db, toRemove.participantId)
      await db
        .delete(participants)
        .where(eq(participants.participantId, toRemove.participantId))

      const revived = await assignItemToAllParticipants(
        db,
        item.itemId,
        owner.participantId
      )

      const revivedParticipantIds = revived.map((r) => r.assignedParticipantId)
      expect(revivedParticipantIds).toContain(newParticipant.participantId)
      expect(revivedParticipantIds).not.toContain(toRemove.participantId)

      const currentParticipantList = await db
        .select({ participantId: participants.participantId })
        .from(participants)
        .where(eq(participants.planId, plan.planId))
      const currentIds = currentParticipantList
        .map((p) => p.participantId)
        .sort()

      expect(revivedParticipantIds.sort()).toEqual(currentIds)
    })
  })

  describe('createItemsForNewParticipant handles mixed group states', () => {
    it('only creates copies for active groups, not canceled ones', async () => {
      const [plan] = await seedTestPlans(1)
      const planParticipants = await seedTestParticipants(plan.planId, 3)
      const owner = planParticipants.find((p) => p.role === 'owner')!
      const planItems = await seedTestItems(plan.planId, 3)

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
      await assignItemToAllParticipants(
        db,
        planItems[2].itemId,
        owner.participantId
      )

      await unassignGroup(db, planItems[1].itemId)

      const [newParticipant] = await db
        .insert(participants)
        .values({
          planId: plan.planId,
          name: 'Late',
          lastName: 'Arrival',
          contactPhone: '+1-555-333-4444',
          role: 'participant',
        })
        .returning()

      const created = await createItemsForNewParticipant(
        db,
        plan.planId,
        newParticipant.participantId
      )

      expect(created).toHaveLength(2)
      const createdNames = created.map((c) => c.name).sort()
      expect(createdNames).toEqual(
        [planItems[0].name, planItems[2].name].sort()
      )
    })
  })
})
