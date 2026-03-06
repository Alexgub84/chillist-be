import type { Assignment, ItemStatus } from '../db/schema.js'

function dedupeAssignments(list: Assignment[]): Assignment[] {
  const map = new Map<string, Assignment>()
  for (const entry of list) {
    map.set(entry.participantId, entry)
  }
  return Array.from(map.values())
}

export function resolveAssignments(
  incoming: Assignment[] | undefined
): Assignment[] {
  if (!incoming || incoming.length === 0) return []
  return dedupeAssignments(incoming)
}

export interface AssignmentChangeValidation {
  valid: boolean
  message?: string
}

export function validateParticipantAssignmentChange(
  incomingList: Assignment[],
  incomingIsAll: boolean | undefined,
  currentIsAll: boolean,
  selfParticipantId: string
): AssignmentChangeValidation {
  if (incomingIsAll !== undefined && incomingIsAll !== currentIsAll) {
    return {
      valid: false,
      message: 'Only the plan owner can change the all-participants flag',
    }
  }

  for (const entry of incomingList) {
    if (entry.participantId !== selfParticipantId) {
      return {
        valid: false,
        message: 'Non-owners can only update their own assignment',
      }
    }
  }

  return { valid: true }
}

export function mergeParticipantAssignment(
  currentList: Assignment[],
  incomingEntries: Assignment[],
  unassignSelf?: string
): Assignment[] {
  if (unassignSelf) {
    return currentList.filter((a) => a.participantId !== unassignSelf)
  }

  const incoming = dedupeAssignments(incomingEntries)
  const incomingMap = new Map<string, Assignment>()
  for (const entry of incoming) {
    incomingMap.set(entry.participantId, entry)
  }

  const merged = currentList.map((a) => {
    const override = incomingMap.get(a.participantId)
    if (override) incomingMap.delete(a.participantId)
    return override ?? a
  })

  for (const entry of incomingMap.values()) {
    merged.push(entry)
  }

  return merged
}

export function filterAssignmentForParticipant(
  assignmentStatusList: Assignment[],
  participantId: string
): Assignment[] {
  return assignmentStatusList.filter((a) => a.participantId === participantId)
}

export function addParticipantToAssignments(
  assignmentStatusList: Assignment[],
  participantId: string,
  defaultStatus: ItemStatus
): Assignment[] {
  if (assignmentStatusList.some((a) => a.participantId === participantId)) {
    return assignmentStatusList
  }
  return [...assignmentStatusList, { participantId, status: defaultStatus }]
}
