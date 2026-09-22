import { route } from '../lib/router.js'

async function main() {
  const prompt = process.argv[2]
  if (!prompt || prompt.length < 30) process.exit(0)

  const result = await route(prompt)
  if (result.matches.length === 0) process.exit(0)

  const top = result.matches.slice(0, 4)
  const skills = top.map(m => `${m.name} (${Math.round(m.confidence * 100)}%)`).join(', ')
  console.log(`Suggested skills: ${skills} [${result.latencyMs}ms via ${result.provider}]`)
}

main().catch(() => process.exit(0))
