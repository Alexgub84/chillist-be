import fs from 'node:fs'
import path from 'node:path'

const name = process.argv[2]
if (!name) {
  console.error('Usage: npm run db:new-migration -- <name>')
  console.error('Example: npm run db:new-migration -- add_user_phone_index')
  process.exit(1)
}

if (!/^[a-z0-9_]+$/.test(name)) {
  console.error('Name must be lowercase letters, digits, and underscores only')
  process.exit(1)
}

const journalPath = './drizzle/meta/_journal.json'
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'))
const entries: Array<{
  idx: number
  when: number
  tag: string
  version: string
  breakpoints: boolean
}> = journal.entries

const lastEntry = entries[entries.length - 1]
const nextIdx = lastEntry.idx + 1
const tag = `${String(nextIdx).padStart(4, '0')}_${name}`
const sqlFile = path.join('./drizzle', `${tag}.sql`)

if (fs.existsSync(sqlFile)) {
  console.error(`Migration file already exists: ${sqlFile}`)
  process.exit(1)
}

const now = Date.now()

fs.writeFileSync(
  sqlFile,
  `-- Migration: ${tag}\n-- TODO: add your SQL here\n`,
  'utf-8'
)

entries.push({
  idx: nextIdx,
  version: lastEntry.version,
  when: now,
  tag,
  breakpoints: true,
})

fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf-8')

console.log(`Created: drizzle/${tag}.sql`)
console.log(`Journal: idx=${nextIdx}, when=${now}`)
