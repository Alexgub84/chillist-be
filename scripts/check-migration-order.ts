import fs from 'node:fs'

const journalPath = './drizzle/meta/_journal.json'

if (!fs.existsSync(journalPath)) {
  console.error('No migration journal found at', journalPath)
  process.exit(1)
}

const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'))
const entries: Array<{ idx: number; when: number; tag: string }> =
  journal.entries

let previousWhen = 0
let previousTag = ''
let hasError = false

for (const entry of entries) {
  if (entry.when <= previousWhen) {
    console.error(
      `Migration timestamp out of order: "${entry.tag}" (when: ${entry.when}) <= "${previousTag}" (when: ${previousWhen})`
    )
    console.error(
      `Drizzle skips migrations whose timestamp is <= the last applied migration.`
    )
    console.error(
      `Fix: update the "when" value in drizzle/meta/_journal.json so timestamps are strictly increasing.`
    )
    hasError = true
  }
  previousWhen = entry.when
  previousTag = entry.tag
}

if (hasError) {
  process.exit(1)
}

console.log(
  `All ${entries.length} migration timestamps are in ascending order.`
)
