import type { ItemCategory, Unit } from '../db/schema.js'

export type UnitResult = { unit: Unit } | { error: string }

export function isEquipmentCategory(category: string): boolean {
  return category === 'group_equipment' || category === 'personal_equipment'
}

export function normalizeCategory(category: string): ItemCategory {
  if (category === 'equipment') return 'group_equipment'
  return category as ItemCategory
}

export function resolveItemUnit(
  category: ItemCategory,
  unit?: Unit
): UnitResult {
  if (category === 'food' && !unit) {
    return { error: 'Unit is required for food items' }
  }
  return { unit: isEquipmentCategory(category) ? 'pcs' : unit! }
}

export function resolveItemUnitForUpdate(
  existingCategory: ItemCategory,
  existingUnit: Unit,
  updates: { category?: ItemCategory; unit?: Unit }
): UnitResult | null {
  const { category: newCategory, unit: newUnit } = updates
  if (newCategory === undefined && newUnit === undefined) return null

  const effectiveCategory = newCategory ?? existingCategory

  if (isEquipmentCategory(effectiveCategory)) {
    if (newUnit && newUnit !== 'pcs') {
      return { error: 'Equipment items must use pcs as the unit' }
    }
    return { unit: 'pcs' }
  }

  return { unit: newUnit ?? existingUnit }
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
