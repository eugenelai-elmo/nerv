import type { Orchestrator } from '../lib/types.js'

// `ticket` creates a new Jira ticket from a description via sprintmo:ticket (a Jira write — NERV only prints it).
const orchestrator: Orchestrator = {
  name: 'sprintmo',

  async supports(mode, input) {
    if (mode !== 'ticket') return `no ${mode} step`
    if (!input.text.trim()) return 'needs a description of the work'
    return true
  },

  async resolve(_mode, input, repo) {
    return { kind: 'invoke', invocation: `/sprintmo:ticket ${input.text} (repo: ${repo.name})` }
  },
}

export default orchestrator
