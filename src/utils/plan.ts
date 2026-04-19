import type { ItemQuantitySource } from '../db/schema.js'

export const DEFAULT_ITEM_QUANTITY_SOURCE: ItemQuantitySource = 'estimated'

export function resolveItemQuantitySource(
  value: ItemQuantitySource | null | undefined
): ItemQuantitySource {
  return value ?? DEFAULT_ITEM_QUANTITY_SOURCE
}

export function withItemQuantitySourceDefault<
  T extends { itemQuantitySource?: ItemQuantitySource | null },
>(row: T): T & { itemQuantitySource: ItemQuantitySource } {
  return {
    ...row,
    itemQuantitySource: resolveItemQuantitySource(row.itemQuantitySource),
  }
}
