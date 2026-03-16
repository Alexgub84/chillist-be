import type { ItemStatus } from '../../db/schema.js'

export type ListType = 'full' | 'buying' | 'packing' | 'unassigned'

export interface ItemWithAssignments {
  name: string
  quantity: number
  unit: string | null
  category: string | null
  isAllParticipants: boolean
  assignmentStatusList: Array<{ participantId: string; status: ItemStatus }>
}

export function filterItemsForList(
  items: ItemWithAssignments[],
  listType: ListType,
  participantId?: string
): ItemWithAssignments[] {
  switch (listType) {
    case 'full':
      return items

    case 'buying':
      return items.filter((item) => {
        const assignments = participantId
          ? item.assignmentStatusList.filter(
              (a) => a.participantId === participantId
            )
          : item.assignmentStatusList
        return assignments.some((a) => a.status === 'pending')
      })

    case 'packing':
      return items.filter((item) => {
        const assignments = participantId
          ? item.assignmentStatusList.filter(
              (a) => a.participantId === participantId
            )
          : item.assignmentStatusList
        return assignments.some((a) => a.status === 'purchased')
      })

    case 'unassigned':
      return items.filter(
        (item) =>
          item.assignmentStatusList.length === 0 && !item.isAllParticipants
      )
  }
}
