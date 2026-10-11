import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Orchestrator } from '../lib/types.js'
import type { Mode } from '../lib/modes.js'
import { buildRebaseProfile } from '../lib/rebase-profile.js'
import { flowmoRepoKind } from '../lib/flowmo-registry.js'
import { loadConfig } from '../lib/resolve-provider.js'
import { readRepoCapabilities } from '../lib/repo-capabilities.js'

const PLAYBOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'playbooks')

// Modes NERV implements itself, identically across repos. Repo commands for these are not used.
const OWNED: readonly Mode[] = ['refresh']

const orchestrator: Orchestrator = {
  name: 'nerv',

  async supports(mode) {
    return OWNED.includes(mode) ? true : `NERV doesn't own ${mode}`
  },

  async resolve(_mode, _input, repo) {
    const config = await loadConfig()
    const profile = await buildRebaseProfile(repo, {
      kind: await flowmoRepoKind(repo.name),
      overrides: config.dev?.repos?.[repo.name]?.refresh,
    })
    const skills = (await readRepoCapabilities(repo.path)).skills.filter(s => /git|workflow/i.test(s.name))
    return { kind: 'playbook', playbook: join(PLAYBOOKS, 'refresh.md'), profile, skills: skills.length ? skills : undefined }
  },
}

export default orchestrator
