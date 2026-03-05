import { describe, it, expect } from 'vitest'
import {
  resolveAssignments,
  validateParticipantAssignmentChange,
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
  const current: Assignment[] = [
    { participantId: pid1, status: 'pending' },
    { participantId: pid2, status: 'purchased' },
  ]

  it('allows participant to update their own status', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'purchased' },
      { participantId: pid2, status: 'purchased' },
    ]
    const result = validateParticipantAssignmentChange(
      current,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('allows participant to remove themselves (unassign)', () => {
    const incoming: Assignment[] = [
      { participantId: pid2, status: 'purchased' },
    ]
    const result = validateParticipantAssignmentChange(
      current,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('allows participant to add themselves', () => {
    const currentNoSelf: Assignment[] = [
      { participantId: pid2, status: 'purchased' },
    ]
    const incoming: Assignment[] = [
      { participantId: pid2, status: 'purchased' },
      { participantId: pid1, status: 'pending' },
    ]
    const result = validateParticipantAssignmentChange(
      currentNoSelf,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('rejects when participant changes another entry status', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'pending' },
      { participantId: pid2, status: 'packed' },
    ]
    const result = validateParticipantAssignmentChange(
      current,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(false)
    expect(result.message).toContain('own assignment')
  })

  it('rejects when participant removes another entry', () => {
    const incoming: Assignment[] = [{ participantId: pid1, status: 'pending' }]
    const result = validateParticipantAssignmentChange(
      current,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(false)
  })

  it('rejects when participant adds a new entry for someone else', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'pending' },
      { participantId: pid2, status: 'purchased' },
      { participantId: pid3, status: 'pending' },
    ]
    const result = validateParticipantAssignmentChange(
      current,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(false)
  })

  it('rejects when participant changes isAllParticipants flag', () => {
    const result = validateParticipantAssignmentChange(
      current,
      false,
      current,
      true,
      pid1
    )
    expect(result.valid).toBe(false)
    expect(result.message).toContain('all-participants flag')
  })

  it('allows no-op (same data)', () => {
    const result = validateParticipantAssignmentChange(
      current,
      false,
      [...current],
      false,
      pid1
    )
    expect(result.valid).toBe(true)
  })

  it('allows participant to both update status and stay in list', () => {
    const incoming: Assignment[] = [
      { participantId: pid1, status: 'packed' },
      { participantId: pid2, status: 'purchased' },
    ]
    const result = validateParticipantAssignmentChange(
      current,
      false,
      incoming,
      false,
      pid1
    )
    expect(result.valid).toBe(true)
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
