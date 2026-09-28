import type { Orchestrator } from '../lib/types.js'
import type { Mode } from '../lib/modes.js'
import { readRepoCapabilities } from '../lib/repo-capabilities.js'

// The repo's own workflow: its .claude/commands for each mode, else its skills as context.
// rebase is NERV-owned (orchestrators/nerv.ts) so it behaves the same in every repo.
const CANDIDATES: Record<Mode, string[]> = {
  plan: ['issue', 'plan'],
  implement: ['implement'],
  pull: [],
  rebase: [],
  ship: ['ship'],
}

const SKILL_CONTEXT_MODES: readonly Mode[] = ['plan', 'implement']

const orchestrator: Orchestrator = {
  name: 'kernel',

  async supports(mode, _input, repo) {
    const caps = await readRepoCapabilities(repo.path)
    if (CANDIDATES[mode].some(c => caps.commands.includes(c))) return true
    if (SKILL_CONTEXT_MODES.includes(mode) && caps.skills.length > 0) return true
    return `${repo.name} has no ${mode} command`
  },

  async resolve(mode, input, repo) {
    const caps = await readRepoCapabilities(repo.path)
    const command = CANDIDATES[mode].find(c => caps.commands.includes(c))
    const skills = caps.skills.length > 0 ? caps.skills : undefined
    if (command) {
      return { kind: 'invoke', invocation: `/${command}${input.text ? ` ${input.text}` : ''}`, skills }
    }
    return { kind: 'context', skills, note: `No ${mode} command in ${repo.name} — work from the repo skills.` }
  },
}

export default orchestrator
