import type { Orchestrator, OrchestratorContext, OrchestratorResult } from '../lib/types.js'

const MODE_MAP: Record<string, string> = {
  implement: 'delivery implement',
  plan: 'delivery plan',
  sync: 'delivery sync',
}

const orchestrator: Orchestrator = {
  name: 'flowmo',
  modes: Object.keys(MODE_MAP),
  defaultMode: 'implement',

  resolve(ctx: OrchestratorContext): OrchestratorResult {
    const mode = this.modes.includes(ctx.mode) ? ctx.mode : this.defaultMode
    const subcommand = MODE_MAP[mode]

    return {
      via: this.name,
      mode,
      action: 'invoke-skill',
      skill: 'flowmo',
      skillArgs: `${subcommand} ${ctx.task}`,
      context: { ...ctx, mode, via: this.name },
    }
  },
}

export default orchestrator
