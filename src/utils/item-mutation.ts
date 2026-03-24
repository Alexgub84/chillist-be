import type { Assignment, Item, ItemCategory, Unit } from '../db/schema.js'
import { normalizeCategory, resolveItemUnit } from './item-helpers.js'
import {
  mergeParticipantAssignment,
  resolveAssignments,
  validateParticipantAssignmentChange,
} from './assignment-helpers.js'

export interface CreateItemInput {
  name: string
  category: string
  quantity: number
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
  assignmentStatusList?: Assignment[]
  isAllParticipants?: boolean
}

export type PreparedItemValues = {
  name: string
  category: ItemCategory
  quantity: number
  unit: Unit
  subcategory?: string | null
  notes?: string | null
  assignmentStatusList: Assignment[]
  isAllParticipants: boolean
}

export function prepareItemForCreate(
  input: CreateItemInput,
  isOwner: boolean,
  participantIds: string[]
): { values: PreparedItemValues } | { error: string } {
  const category = normalizeCategory(input.category)
  const unitResult = resolveItemUnit(category, input.unit)
  if ('error' in unitResult) {
    return { error: unitResult.error }
  }
  const hasAssignmentFields =
    input.assignmentStatusList !== undefined ||
    input.isAllParticipants !== undefined
  if (hasAssignmentFields && !isOwner) {
    return { error: 'Only the plan owner can set assignments on create' }
  }
  let resolved = resolveAssignments(input.assignmentStatusList)
  const isAll =
    input.isAllParticipants ??
    (category === 'personal_equipment' ? true : false)
  if (isAll && resolved.length === 0) {
    resolved = participantIds.map((id) => ({
      participantId: id,
      status: 'pending' as const,
    }))
  }
  return {
    values: {
      name: input.name,
      category,
      quantity: input.quantity,
      unit: unitResult.unit,
      subcategory: input.subcategory ?? null,
      notes: input.notes ?? null,
      assignmentStatusList: resolved,
      isAllParticipants: isAll,
    },
  }
}

export interface UpdateBodyFields {
  name?: string
  category?: ItemCategory
  quantity?: number
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
}

export function splitUpdatePayload(body: {
  assignmentStatusList?: Assignment[]
  isAllParticipants?: boolean
  unassign?: boolean
  name?: string
  category?: string
  quantity?: number
  unit?: Unit
  subcategory?: string | null
  notes?: string | null
}):
  | {
      fieldUpdates: UpdateBodyFields
      bodyAssignments: Assignment[] | undefined
      bodyIsAll: boolean | undefined
      unassign: boolean | undefined
      hasAssignmentFields: boolean
    }
  | { error: string } {
  const {
    assignmentStatusList: bodyAssignments,
    isAllParticipants: bodyIsAll,
    unassign,
    ...rest
  } = body
  const fieldUpdates = { ...rest } as UpdateBodyFields
  if (fieldUpdates.category) {
    fieldUpdates.category = normalizeCategory(fieldUpdates.category)
  }
  const hasAssignmentFields =
    bodyAssignments !== undefined ||
    bodyIsAll !== undefined ||
    unassign === true
  if (Object.keys(fieldUpdates).length === 0 && !hasAssignmentFields) {
    return { error: 'No fields to update' }
  }
  if (unassign && bodyAssignments !== undefined) {
    return {
      error:
        'Cannot set both unassign and assignmentStatusList. Use one or the other.',
    }
  }
  return {
    fieldUpdates,
    bodyAssignments,
    bodyIsAll: bodyIsAll,
    unassign,
    hasAssignmentFields,
  }
}

export function computeFinalAssignmentState(
  existingItem: Item,
  bodyAssignments: Assignment[] | undefined,
  bodyIsAll: boolean | undefined,
  unassign: boolean | undefined,
  isOwner: boolean,
  participantId: string
): { finalList: Assignment[]; finalIsAll: boolean } {
  const currentList = existingItem.assignmentStatusList as Assignment[]
  let finalList: Assignment[]
  if (isOwner) {
    finalList =
      bodyAssignments !== undefined
        ? resolveAssignments(bodyAssignments)
        : currentList
  } else if (unassign) {
    finalList = mergeParticipantAssignment(currentList, [], participantId)
  } else {
    finalList = mergeParticipantAssignment(currentList, bodyAssignments ?? [])
  }
  const finalIsAll = bodyIsAll ?? existingItem.isAllParticipants
  return { finalList, finalIsAll }
}

export function validateNonOwnerAssignmentChange(
  bodyAssignments: Assignment[] | undefined,
  bodyIsAll: boolean | undefined,
  existingIsAll: boolean,
  participantId: string
): { ok: true } | { error: string } {
  const incomingList = bodyAssignments ?? []
  const validation = validateParticipantAssignmentChange(
    incomingList,
    bodyIsAll,
    existingIsAll,
    participantId
  )
  if (!validation.valid) {
    return { error: validation.message! }
  }
  return { ok: true }
}
