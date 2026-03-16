import { describe, it, expect } from 'vitest'
import {
  filterItemsForList,
  type ItemWithAssignments,
} from '../../../src/services/whatsapp/item-filters.js'

function makeItem(
  overrides: Partial<ItemWithAssignments> = {}
): ItemWithAssignments {
  return {
    name: 'Test Item',
    quantity: 1,
    unit: 'pcs',
    category: 'food',
    isAllParticipants: false,
    assignmentStatusList: [],
    ...overrides,
  }
}

const P1 = 'participant-1'
const P2 = 'participant-2'

describe('filterItemsForList', () => {
  describe('full', () => {
    it('returns all items', () => {
      const items = [makeItem({ name: 'A' }), makeItem({ name: 'B' })]
      expect(filterItemsForList(items, 'full')).toEqual(items)
    })

    it('returns empty array for empty input', () => {
      expect(filterItemsForList([], 'full')).toEqual([])
    })
  })

  describe('buying', () => {
    it('includes items with pending assignments', () => {
      const items = [
        makeItem({
          name: 'Pending',
          assignmentStatusList: [{ participantId: P1, status: 'pending' }],
        }),
        makeItem({
          name: 'Purchased',
          assignmentStatusList: [{ participantId: P1, status: 'purchased' }],
        }),
      ]
      const result = filterItemsForList(items, 'buying')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Pending')
    })

    it('filters by participantId when provided', () => {
      const items = [
        makeItem({
          name: 'P1 Pending',
          assignmentStatusList: [{ participantId: P1, status: 'pending' }],
        }),
        makeItem({
          name: 'P2 Pending',
          assignmentStatusList: [{ participantId: P2, status: 'pending' }],
        }),
      ]
      const result = filterItemsForList(items, 'buying', P1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('P1 Pending')
    })

    it('excludes items with no assignments', () => {
      const items = [makeItem({ name: 'Unassigned' })]
      expect(filterItemsForList(items, 'buying')).toEqual([])
    })

    it('includes item if any assignment is pending (no participant filter)', () => {
      const items = [
        makeItem({
          name: 'Mixed',
          assignmentStatusList: [
            { participantId: P1, status: 'purchased' },
            { participantId: P2, status: 'pending' },
          ],
        }),
      ]
      const result = filterItemsForList(items, 'buying')
      expect(result).toHaveLength(1)
    })
  })

  describe('packing', () => {
    it('includes items with purchased assignments', () => {
      const items = [
        makeItem({
          name: 'Purchased',
          assignmentStatusList: [{ participantId: P1, status: 'purchased' }],
        }),
        makeItem({
          name: 'Pending',
          assignmentStatusList: [{ participantId: P1, status: 'pending' }],
        }),
      ]
      const result = filterItemsForList(items, 'packing')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Purchased')
    })

    it('filters by participantId when provided', () => {
      const items = [
        makeItem({
          name: 'P1 Purchased',
          assignmentStatusList: [{ participantId: P1, status: 'purchased' }],
        }),
        makeItem({
          name: 'P2 Purchased',
          assignmentStatusList: [{ participantId: P2, status: 'purchased' }],
        }),
      ]
      const result = filterItemsForList(items, 'packing', P1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('P1 Purchased')
    })

    it('excludes packed items', () => {
      const items = [
        makeItem({
          name: 'Packed',
          assignmentStatusList: [{ participantId: P1, status: 'packed' }],
        }),
      ]
      expect(filterItemsForList(items, 'packing')).toEqual([])
    })
  })

  describe('unassigned', () => {
    it('includes items with empty assignments and isAllParticipants false', () => {
      const items = [
        makeItem({
          name: 'Unassigned',
          assignmentStatusList: [],
          isAllParticipants: false,
        }),
        makeItem({
          name: 'Assigned',
          assignmentStatusList: [{ participantId: P1, status: 'pending' }],
          isAllParticipants: false,
        }),
      ]
      const result = filterItemsForList(items, 'unassigned')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Unassigned')
    })

    it('excludes isAllParticipants items even if no assignments', () => {
      const items = [
        makeItem({
          name: 'AllParticipants',
          assignmentStatusList: [],
          isAllParticipants: true,
        }),
      ]
      expect(filterItemsForList(items, 'unassigned')).toEqual([])
    })

    it('returns empty for no unassigned items', () => {
      const items = [
        makeItem({
          name: 'Assigned',
          assignmentStatusList: [{ participantId: P1, status: 'pending' }],
        }),
      ]
      expect(filterItemsForList(items, 'unassigned')).toEqual([])
    })

    it('participantId parameter is ignored for unassigned filter', () => {
      const items = [
        makeItem({
          name: 'Unassigned',
          assignmentStatusList: [],
          isAllParticipants: false,
        }),
      ]
      const result = filterItemsForList(items, 'unassigned', P1)
      expect(result).toHaveLength(1)
    })
  })
})
