import { describe, it, expect } from 'vitest'
import {
  resolveAssignments,
  addParticipantToAssignments,
} from '../../src/utils/assignment-helpers.js'
import type { Assignment } from '../../src/db/schema.js'

const pid1 = '00000000-0000-0000-0000-000000000001'
const pid2 = '00000000-0000-0000-0000-000000000002'
const pid3 = '00000000-0000-0000-0000-000000000003'

const emptyCurrent = {
  assignmentStatusList: [] as Assignment[],
  isAllParticipants: false,
}

describe('resolveAssignments', () => {
  describe('create scenarios (current = empty)', () => {
    it('returns empty when no assignment fields provided', () => {
      const result = resolveAssignments({
        current: emptyCurrent,
        planParticipantIds: [pid1, pid2, pid3],
        payload: {},
      })
      expect(result).toEqual({
        assignmentStatusList: [],
        isAllParticipants: false,
      })
    })

    it('assigns all participants with assignToAll: true', () => {
      const result = resolveAssignments({
        current: emptyCurrent,
        planParticipantIds: [pid1, pid2, pid3],
        payload: { assignToAll: true },
      })
      expect(result.isAllParticipants).toBe(true)
      expect(result.assignmentStatusList).toHaveLength(3)
      expect(result.assignmentStatusList).toEqual([
        { participantId: pid1, status: 'pending' },
        { participantId: pid2, status: 'pending' },
        { participantId: pid3, status: 'pending' },
      ])
    })

    it('returns empty list with assignToAll: true and 0 participants', () => {
      const result = resolveAssignments({
        current: emptyCurrent,
        planParticipantIds: [],
        payload: { assignToAll: true },
      })
      expect(result.isAllParticipants).toBe(true)
      expect(result.assignmentStatusList).toEqual([])
    })

    it('sets explicit assignmentStatusList with 2 participants', () => {
      const assignments: Assignment[] = [
        { participantId: pid1, status: 'pending' },
        { participantId: pid2, status: 'pending' },
      ]
      const result = resolveAssignments({
        current: emptyCurrent,
        planParticipantIds: [pid1, pid2, pid3],
        payload: { assignmentStatusList: assignments },
      })
      expect(result.isAllParticipants).toBe(false)
      expect(result.assignmentStatusList).toEqual(assignments)
    })

    it('dedupes explicit assignmentStatusList (last entry wins)', () => {
      const assignments: Assignment[] = [
        { participantId: pid1, status: 'pending' },
        { participantId: pid1, status: 'purchased' },
      ]
      const result = resolveAssignments({
        current: emptyCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { assignmentStatusList: assignments },
      })
      expect(result.assignmentStatusList).toEqual([
        { participantId: pid1, status: 'purchased' },
      ])
    })
  })

  describe('update scenarios (current = existing data)', () => {
    const existingCurrent = {
      assignmentStatusList: [
        { participantId: pid1, status: 'pending' as const },
        { participantId: pid2, status: 'purchased' as const },
      ],
      isAllParticipants: false,
    }

    it('assignToAll: true replaces existing list with all plan participants', () => {
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2, pid3],
        payload: { assignToAll: true },
      })
      expect(result.isAllParticipants).toBe(true)
      expect(result.assignmentStatusList).toHaveLength(3)
      expect(
        result.assignmentStatusList.every((a) => a.status === 'pending')
      ).toBe(true)
    })

    it('assignToAll: false clears list and sets isAllParticipants to false', () => {
      const allCurrent = {
        assignmentStatusList: [
          { participantId: pid1, status: 'pending' as const },
          { participantId: pid2, status: 'pending' as const },
        ],
        isAllParticipants: true,
      }
      const result = resolveAssignments({
        current: allCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { assignToAll: false },
      })
      expect(result).toEqual({
        assignmentStatusList: [],
        isAllParticipants: false,
      })
    })

    it('explicit assignmentStatusList replaces current list', () => {
      const newAssignments: Assignment[] = [
        { participantId: pid3, status: 'pending' },
      ]
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2, pid3],
        payload: { assignmentStatusList: newAssignments },
      })
      expect(result.isAllParticipants).toBe(false)
      expect(result.assignmentStatusList).toEqual(newAssignments)
    })

    it('forParticipantId + status updates only that entry', () => {
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { forParticipantId: pid1, status: 'packed' },
      })
      expect(result.assignmentStatusList).toEqual([
        { participantId: pid1, status: 'packed' },
        { participantId: pid2, status: 'purchased' },
      ])
    })

    it('forParticipantId + status for non-existent participant is a no-op', () => {
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { forParticipantId: pid3, status: 'packed' },
      })
      expect(result.assignmentStatusList).toEqual(
        existingCurrent.assignmentStatusList
      )
    })

    it('forParticipantId + unassign removes that entry', () => {
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { forParticipantId: pid1, unassign: true },
      })
      expect(result.assignmentStatusList).toEqual([
        { participantId: pid2, status: 'purchased' },
      ])
    })

    it('forParticipantId + unassign for non-existent participant is a no-op', () => {
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { forParticipantId: pid3, unassign: true },
      })
      expect(result.assignmentStatusList).toEqual(
        existingCurrent.assignmentStatusList
      )
    })

    it('no assignment fields returns current unchanged', () => {
      const result = resolveAssignments({
        current: existingCurrent,
        planParticipantIds: [pid1, pid2],
        payload: {},
      })
      expect(result).toEqual(existingCurrent)
    })

    it('preserves isAllParticipants when using forParticipantId + status', () => {
      const allCurrent = {
        assignmentStatusList: [
          { participantId: pid1, status: 'pending' as const },
          { participantId: pid2, status: 'pending' as const },
        ],
        isAllParticipants: true,
      }
      const result = resolveAssignments({
        current: allCurrent,
        planParticipantIds: [pid1, pid2],
        payload: { forParticipantId: pid1, status: 'purchased' },
      })
      expect(result.isAllParticipants).toBe(true)
      expect(result.assignmentStatusList[0]).toEqual({
        participantId: pid1,
        status: 'purchased',
      })
      expect(result.assignmentStatusList[1]).toEqual({
        participantId: pid2,
        status: 'pending',
      })
    })
  })

  describe('priority order', () => {
    it('assignToAll takes precedence over assignmentStatusList', () => {
      const result = resolveAssignments({
        current: emptyCurrent,
        planParticipantIds: [pid1, pid2],
        payload: {
          assignToAll: true,
          assignmentStatusList: [{ participantId: pid3, status: 'pending' }],
        },
      })
      expect(result.isAllParticipants).toBe(true)
      expect(result.assignmentStatusList).toHaveLength(2)
    })

    it('assignmentStatusList takes precedence over forParticipantId', () => {
      const current = {
        assignmentStatusList: [
          { participantId: pid1, status: 'pending' as const },
        ],
        isAllParticipants: false,
      }
      const result = resolveAssignments({
        current,
        planParticipantIds: [pid1, pid2],
        payload: {
          assignmentStatusList: [{ participantId: pid2, status: 'pending' }],
          forParticipantId: pid1,
          status: 'purchased',
        },
      })
      expect(result.assignmentStatusList).toEqual([
        { participantId: pid2, status: 'pending' },
      ])
    })
  })
})

describe('addParticipantToAssignments', () => {
  it('adds new participant with default status', () => {
    const list: Assignment[] = [{ participantId: pid1, status: 'pending' }]
    const result = addParticipantToAssignments(list, pid2, 'pending')
    expect(result).toEqual([
      { participantId: pid1, status: 'pending' },
      { participantId: pid2, status: 'pending' },
    ])
  })

  it('does not duplicate if participant already exists', () => {
    const list: Assignment[] = [{ participantId: pid1, status: 'purchased' }]
    const result = addParticipantToAssignments(list, pid1, 'pending')
    expect(result).toEqual([{ participantId: pid1, status: 'purchased' }])
  })

  it('adds to empty list', () => {
    const result = addParticipantToAssignments([], pid1, 'pending')
    expect(result).toEqual([{ participantId: pid1, status: 'pending' }])
  })

  it('does not mutate the original array', () => {
    const list: Assignment[] = [{ participantId: pid1, status: 'pending' }]
    const result = addParticipantToAssignments(list, pid2, 'pending')
    expect(list).toHaveLength(1)
    expect(result).toHaveLength(2)
  })
})
