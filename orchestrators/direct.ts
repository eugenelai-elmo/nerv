import type { Orchestrator } from '../lib/types.js'

const orchestrator: Orchestrator = {
  name: 'direct',

  async supports() {
    return true
  },

  async resolve() {
    return { kind: 'context', note: 'No orchestrator — context resolved, ready for direct work.' }
  },
}

export default orchestrator
