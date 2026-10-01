import type { Orchestrator } from '../lib/types.js'
import type { Mode } from '../lib/modes.js'
import { isFlowmoRepo } from '../lib/flowmo-registry.js'

const COMMAND: Partial<Record<Mode, string>> = {
  plan: 'plan',
  implement: 'implement',
  intake: 'sync',
}

const orchestrator: Orchestrator = {
  name: 'flowmo',

  async supports(mode, input, repo) {
    if (!COMMAND[mode]) return `no ${mode} step`
    if (!input.ticket) return 'needs a ticket key'
    if (!(await isFlowmoRepo(repo.name))) return `${repo.name} not in flowmo related-repos`
    return true
  },

  async resolve(mode, input) {
    return { kind: 'invoke', invocation: `/flowmo ${COMMAND[mode]} ${input.ticket}` }
  },
}

export default orchestrator
