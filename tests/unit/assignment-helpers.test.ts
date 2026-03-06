import { describe, it, expect } from 'vitest'
import {
  resolveAssignments,
  validateParticipantAssignmentChange,
  mergeParticipantAssignment,
  filterAssignmentForParticipant,
  addParticipantToAssignments,
} from '../../src/utils/assignment-helpers.js'
import type { Assignment } from '../../src/db/schema.js'

const pid1 = '00000000-0000-0000-0000-000000000001'
const pid2 = '00000000-0000-0000-0000-000000000002'
const pid3 = '00000000-0000-0000-0000-000000000003'

describe('resolveAssignments', () => {
  it('returns empty array for undefined input', () => {
    expect(resolveAssignments(undefined)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(resolveAssignments([])).toEqual([])
  })

  it('passes through a valid list', () => {
    const list: Assignment[] = [
      { participantId: pid1, status: 'pending' },
      { participantId: pid2, status: 'purchased' },
    ]
    expect(resolveAssignments(list)).toEqual(list)
  })

  it('dedupes by participantId (last entry wins)', () => {
    const list: Assignment[] = [
      { participantId: pid1, status: 'pending' },
      { participantId: pid1, status: 'purchased' },
    ]
    expect(resolveAssignments(list)).toEqual([
      { participantId: pid1, status: 'purchased' },
    ])
  })

  it('dedupes mixed list keeping unique entries', () => {
    const list: Assignment[] = [
      { participantId: pid1, status: 'pending' },
      { participantId: pid2, status: 'pending' },
      { participantId: pid1, status: 'packed' },
    ]
    expect(resolveAssignments(list)).toEqual([
      { participantId: pid1, status: 'packed' },
      { participantId: pid2, status: 'pending' },
    ])
  })
})

describe('validateParticipantAssignmentChange', () => {
  it('allows participant to update their own status', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'purchased' },
    ]
    const result = validateParticipantAssignmentChange(
      incoming,
      undefined,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('rejects when participant sends another participants entry', () => {
    const incoming: Assignment[] = [{ participantId: pid2, status: 'packed' }]
    const result = validateParticipantAssignmentChange(
      incoming,
      undefined,
      false,
      pid1
    )
    expect(result.valid).toBe(false)
    expect(result.message).toContain('own assignment')
  })

  it('rejects when participant includes someone elses entry alongside their own', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'purchased' },
      { participantId: pid2, status: 'packed' },
    ]
    const result = validateParticipantAssignmentChange(
      incoming,
      undefined,
      false,
      pid1
    )
    expect(result.valid).toBe(false)
    expect(result.message).toContain('own assignment')
  })

  it('rejects when participant changes isAllParticipants flag', () => {
    const incoming: Assignment[] = [{ participantId: pid1, status: 'pending' }]
    const result = validateParticipantAssignmentChange(
      incoming,
      true,
      false,
      pid1
    )
    expect(result.valid).toBe(false)
    expect(result.message).toContain('all-participants flag')
  })

  it('allows when isAllParticipants is unchanged', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'purchased' },
    ]
    const result = validateParticipantAssignmentChange(
      incoming,
      false,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('allows when isAllParticipants is undefined (not sent)', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'purchased' },
    ]
    const result = validateParticipantAssignmentChange(
      incoming,
      undefined,
      true,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('allows empty incoming list', () => {
    const result = validateParticipantAssignmentChange(
      [],
      undefined,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })
})

describe('mergeParticipantAssignment', () => {
  const current: Assignment[] = [
    { participantId: pid1, status: 'pending' },
    { participantId: pid2, status: 'pending' },
    { participantId: pid3, status: 'pending' },
  ]

  it('merges a single participant status update', () => {
    const incoming: Assignment[] = [
      { participantId: pid2, status: 'purchased' },
    ]
    const result = mergeParticipantAssignment(current, incoming)
    expect(result).toEqual([
      { participantId: pid1, status: 'pending' },
      { participantId: pid2, status: 'purchased' },
      { participantId: pid3, status: 'pending' },
    ])
  })

  it('leaves list unchanged when incoming is empty', () => {
    const result = mergeParticipantAssignment(current, [])
    expect(result).toEqual(current)
  })

  it('appends self-assignment when participant is not in current list', () => {
    const incoming: Assignment[] = [
      { participantId: 'new-participant', status: 'pending' },
    ]
    const result = mergeParticipantAssignment(current, incoming)
    expect(result).toEqual([
      ...current,
      { participantId: 'new-participant', status: 'pending' },
    ])
  })

  it('self-assigns to an empty list', () => {
    const incoming: Assignment[] = [{ participantId: pid1, status: 'pending' }]
    const result = mergeParticipantAssignment([], incoming)
    expect(result).toEqual([{ participantId: pid1, status: 'pending' }])
  })

  it('unassigns participant when unassignSelf is provided', () => {
    const result = mergeParticipantAssignment(current, [], pid2)
    expect(result).toEqual([
      { participantId: pid1, status: 'pending' },
      { participantId: pid3, status: 'pending' },
    ])
  })

  it('returns unchanged list when unassignSelf target not found', () => {
    const result = mergeParticipantAssignment(current, [], 'not-in-list')
    expect(result).toEqual(current)
  })

  it('does not mutate the original array', () => {
    const incoming: Assignment[] = [{ participantId: pid1, status: 'packed' }]
    mergeParticipantAssignment(current, incoming)
    expect(current[0].status).toBe('pending')
  })
})

describe('filterAssignmentForParticipant', () => {
  const list: Assignment[] = [
    { participantId: pid1, status: 'pending' },
    { participantId: pid2, status: 'purchased' },
    { participantId: pid3, status: 'packed' },
  ]

  it('returns only the matching participant entry', () => {
    const result = filterAssignmentForParticipant(list, pid2)
    expect(result).toEqual([{ participantId: pid2, status: 'purchased' }])
  })

  it('returns empty array when participant is not in list', () => {
    const result = filterAssignmentForParticipant(list, 'not-in-list')
    expect(result).toEqual([])
  })

  it('returns empty array for empty input list', () => {
    const result = filterAssignmentForParticipant([], pid1)
    expect(result).toEqual([])
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
