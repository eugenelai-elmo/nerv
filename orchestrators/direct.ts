import type { Orchestrator, OrchestratorContext, OrchestratorResult } from '../lib/types.js'

const orchestrator: Orchestrator = {
  name: 'direct',
  modes: [],
  defaultMode: 'implement',

  resolve(ctx: OrchestratorContext): OrchestratorResult {
    return {
      via: this.name,
      mode: ctx.mode,
      action: 'context-only',
      context: { ...ctx, via: this.name },
    }
  },
}

export default orchestrator
