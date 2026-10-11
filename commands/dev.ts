#!/usr/bin/env npx tsx
/**
 * nerv dev — orchestrated development from the NERV seat of command.
 *
 *   nerv dev <target> [ticket|intake|plan|implement|refresh|ship] <task> [--repo <worktree>] [--chain a,b] [--via x] [--json]
 *
 * <target> is a dev.targets alias (mobile, frontend, flowmo) or any flowmo-registered repo name.
 */
import { runDev } from '../lib/dev-command.js'

runDev(process.argv.slice(2)).catch(err => {
  console.error((err as Error).message)
  process.exit(1)
})
