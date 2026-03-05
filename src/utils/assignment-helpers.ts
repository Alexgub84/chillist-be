import type { Assignment, ItemStatus } from '../db/schema.js'

export interface ResolveAssignmentsParams {
  current: {
    assignmentStatusList: Assignment[]
    isAllParticipants: boolean
  }
  planParticipantIds: string[]
  payload: {
    assignToAll?: boolean
    assignmentStatusList?: Assignment[]
    forParticipantId?: string
    unassign?: boolean
    status?: ItemStatus
  }
}

export interface ResolveAssignmentsResult {
  assignmentStatusList: Assignment[]
  isAllParticipants: boolean
}

function dedupeAssignments(list: Assignment[]): Assignment[] {
  const map = new Map<string, Assignment>()
  for (const entry of list) {
    map.set(entry.participantId, entry)
  }
  return Array.from(map.values())
}

export function resolveAssignments(
  params: ResolveAssignmentsParams
): ResolveAssignmentsResult {
  const { current, planParticipantIds, payload } = params

  if (payload.assignToAll === true) {
    return {
      assignmentStatusList: planParticipantIds.map((pid) => ({
        participantId: pid,
        status: 'pending' as ItemStatus,
      })),
      isAllParticipants: true,
    }
  }

  if (payload.assignToAll === false) {
    return {
      assignmentStatusList: [],
      isAllParticipants: false,
    }
  }

  if (payload.assignmentStatusList !== undefined) {
    return {
      assignmentStatusList: dedupeAssignments(payload.assignmentStatusList),
      isAllParticipants: false,
    }
  }

  if (payload.forParticipantId) {
    if (payload.unassign === true) {
      return {
        assignmentStatusList: current.assignmentStatusList.filter(
          (a) => a.participantId !== payload.forParticipantId
        ),
        isAllParticipants: current.isAllParticipants,
      }
    }

    if (payload.status !== undefined) {
      const found = current.assignmentStatusList.some(
        (a) => a.participantId === payload.forParticipantId
      )
      if (!found) {
        return { ...current }
      }
      return {
        assignmentStatusList: current.assignmentStatusList.map((a) =>
          a.participantId === payload.forParticipantId
            ? { ...a, status: payload.status! }
            : a
        ),
        isAllParticipants: current.isAllParticipants,
      }
    }
  }

  return { ...current }
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
