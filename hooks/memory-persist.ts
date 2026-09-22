import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { save, list } from '../lib/memory.js'
import { trace, now } from '../lib/trace.js'

const HANDOFF_PATH = join(homedir(), '.claude', 'handoff', 'session-handoff.md')
const DATE = new Date().toISOString().split('T')[0]

let handoff: string
try {
  handoff = await readFile(HANDOFF_PATH, 'utf-8')
} catch {
  process.exit(0)
}

// Extract "Research findings" section if present
const researchMatch = handoff.match(/###\s*Research findings.*?\n([\s\S]*?)(?=\n###|\n##|$)/)
if (!researchMatch) process.exit(0)

const researchBlock = researchMatch[1].trim()
if (!researchBlock) process.exit(0)

// Split into subsections by **heading** patterns
const sections = researchBlock.split(/\n\*\*/).filter(Boolean)
let savedCount = 0

for (const section of sections) {
  const lines = ('**' + section).split('\n')
  const heading = lines[0].replace(/\*\*/g, '').replace(/:/g, '').trim()
  if (!heading || heading.length < 3) continue

  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const body = lines.slice(1).join('\n').trim()
  if (!body) continue

  const content = `---
topic: ${heading}
source: session-handoff
date: ${DATE}
---

${body}
`
  const path = `knowledge/research/${slug}.md`
  const existing = await list('knowledge/research')
  if (existing.includes(path)) continue

  await save(path, content)
  savedCount++
}

await trace({
  ts: now(),
  hook: 'memory-persist',
  layer: 'L4:Memory',
  result: savedCount > 0 ? `saved ${savedCount} entries` : 'no new findings',
  matched: savedCount > 0,
})

if (savedCount > 0) {
  console.log(`NERV Memory: saved ${savedCount} research entries to knowledge/research/`)
}
