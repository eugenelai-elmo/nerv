import { recall, list } from '../lib/memory.js'
import { trace, now } from '../lib/trace.js'

const prompt = process.argv[2]
if (!prompt || prompt.length < 30) process.exit(0)

const KNOWLEDGE_PREFIX = 'knowledge'

const paths = await list(KNOWLEDGE_PREFIX)
if (paths.length === 0) process.exit(0)

const promptLower = prompt.toLowerCase()
const promptWords = promptLower.split(/\s+/).filter(w => w.length > 3)

const matched: Array<{ path: string; content: string }> = []

for (const p of paths) {
  if (!p.endsWith('.md')) continue
  const filename = p.split('/').pop()!.replace('.md', '').replace(/-/g, ' ')
  const nameWords = filename.toLowerCase().split(/\s+/)

  const overlap = nameWords.filter(w => promptWords.some(pw => pw.includes(w) || w.includes(pw)))
  if (overlap.length === 0) continue

  const result = await recall(p, 'L1')
  for (const entry of result.entries) {
    matched.push({ path: p, content: entry.content })
  }
  if (matched.length >= 3) break
}

const start = performance.now()
await trace({
  ts: now(),
  hook: 'memory-recall',
  layer: 'L4:Memory',
  latencyMs: Math.round(performance.now() - start),
  result: matched.length > 0 ? `${matched.length} entries: ${matched.map(m => m.path).join(', ')}` : 'no match',
  prompt_len: prompt.length,
  matched: matched.length > 0,
})

if (matched.length === 0) process.exit(0)

const injections = matched.map(m => `[${m.path}]\n${m.content}`).join('\n\n')
console.log(`NERV Memory (${matched.length} entries):\n${injections}`)
