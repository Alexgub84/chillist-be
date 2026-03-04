import type { ItemCategory, Unit } from '../db/schema.js'

export type UnitResult = { unit: Unit } | { error: string }

export function resolveItemUnit(
  category: ItemCategory,
  unit?: Unit
): UnitResult {
  if (category === 'food' && !unit) {
    return { error: 'Unit is required for food items' }
  }
  return { unit: category === 'equipment' ? 'pcs' : unit! }
}

export function classifyDbError(
  error: unknown,
  fallbackMessage: string
): { statusCode: number; message: string } {
  const isConnectionError =
    error instanceof Error &&
    (error.message.includes('connect') || error.message.includes('timeout'))

  if (isConnectionError) {
    return { statusCode: 503, message: 'Database connection error' }
  }

  return { statusCode: 500, message: fallbackMessage }
}
