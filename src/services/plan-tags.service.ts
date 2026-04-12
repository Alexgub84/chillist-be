import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Loaded once at import time — no DB, no network, always available
const planTagsData = require('../data/plan-creation-tags.json') as Record<
  string,
  unknown
>

export function getPlanTags(): Record<string, unknown> {
  return planTagsData
}
