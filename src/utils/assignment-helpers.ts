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
  currentList: Assignment[],
  currentIsAll: boolean,
  incomingList: Assignment[],
  incomingIsAll: boolean,
  selfParticipantId: string
): AssignmentChangeValidation {
  if (incomingIsAll !== currentIsAll) {
    return {
      valid: false,
      message: 'Only the plan owner can change the all-participants flag',
    }
  }

  const currentMap = new Map<string, string>()
  for (const a of currentList) {
    currentMap.set(a.participantId, a.status)
  }

  const incomingMap = new Map<string, string>()
  for (const a of dedupeAssignments(incomingList)) {
    incomingMap.set(a.participantId, a.status)
  }

  for (const [pid, status] of currentMap) {
    if (pid === selfParticipantId) continue
    const incomingStatus = incomingMap.get(pid)
    if (incomingStatus === undefined) {
      return {
        valid: false,
        message: 'Non-owners can only update their own assignment',
      }
    }
    if (incomingStatus !== status) {
      return {
        valid: false,
        message: 'Non-owners can only update their own assignment',
      }
    }
  }

  for (const [pid] of incomingMap) {
    if (pid === selfParticipantId) continue
    if (!currentMap.has(pid)) {
      return {
        valid: false,
        message: 'Non-owners can only update their own assignment',
      }
    }
  }

  return { valid: true }
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
