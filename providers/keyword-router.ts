import type { SkillEntry, SkillMatch } from '../lib/types.js'

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2))
}

const provider = {
  name: 'keyword-router',

  async route(prompt: string, inventory: SkillEntry[]): Promise<SkillMatch[]> {
    const promptTokens = tokenize(prompt)
    const matches: SkillMatch[] = []

    for (const skill of inventory) {
      const triggers = skill.triggerPatterns.map(t => t.toLowerCase())
      const hits = triggers.filter(t => {
        const words = t.split(/\s+/)
        return words.some(w => promptTokens.has(w))
      })

      if (hits.length > 0) {
        matches.push({
          name: skill.name,
          confidence: Math.min(hits.length / triggers.length, 1),
          reason: `keyword: ${hits.join(', ')}`,
        })
      }
    }

    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
  },
}

export default provider
