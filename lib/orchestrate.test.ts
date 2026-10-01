import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Orchestrator, RepoContext } from './types.js'
import { parseTaskInput } from './modes.js'
import { parseSkillDescription } from './repo-capabilities.js'

let tmp: string
let kernelRepo: RepoContext
let skillsOnlyRepo: RepoContext
let bareRepo: RepoContext
let flowmo: Orchestrator
let kernel: Orchestrator
let direct: Orchestrator
let nerv: Orchestrator
let sprintmo: Orchestrator
let pick: typeof import('./orchestrate.js').pick
let NoOrchestrator: typeof import('./orchestrate.js').NoOrchestrator

async function makeRepo(name: string, commands: string[], skills: Record<string, string>): Promise<RepoContext> {
  const path = join(tmp, name)
  await mkdir(join(path, '.claude', 'commands'), { recursive: true })
  for (const c of commands) await writeFile(join(path, '.claude', 'commands', `${c}.md`), `# ${c}`)
  for (const [s, desc] of Object.entries(skills)) {
    await mkdir(join(path, '.claude', 'skills', s), { recursive: true })
    await writeFile(join(path, '.claude', 'skills', s, 'SKILL.md'), `---\nname: ${s}\ndescription: ${desc}\n---\n`)
  }
  return { name, path }
}

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'nerv-orch-'))
  await writeFile(join(tmp, 'related-repos.json'), JSON.stringify({ '$note': 'x', 'kernel-repo': {}, 'skills-repo': {} }))
  process.env.FLOWMO_RELATED_REPOS = join(tmp, 'related-repos.json')
  kernelRepo = await makeRepo('kernel-repo', ['issue', 'implement', 'sync', 'ship'], {})
  skillsOnlyRepo = await makeRepo('skills-repo', ['ship'], { 'mobile-app': 'Expo app guide', 'git-workflow': 'Branch rules' })
  bareRepo = await makeRepo('bare-repo', [], {})
  flowmo = (await import('../orchestrators/flowmo.js')).default
  kernel = (await import('../orchestrators/kernel.js')).default
  direct = (await import('../orchestrators/direct.js')).default
  nerv = (await import('../orchestrators/nerv.js')).default
  sprintmo = (await import('../orchestrators/sprintmo.js')).default
  ;({ pick, NoOrchestrator } = await import('./orchestrate.js'))
})

after(async () => {
  await rm(tmp, { recursive: true, force: true })
})

test('parseTaskInput extracts the ticket key', () => {
  assert.deepEqual(parseTaskInput('pick up HPI-1915 today'), { text: 'pick up HPI-1915 today', ticket: 'HPI-1915' })
  assert.deepEqual(parseTaskInput('add a dark mode toggle'), { text: 'add a dark mode toggle' })
})

test('parseSkillDescription handles inline and block scalars', () => {
  assert.equal(parseSkillDescription('---\ndescription: One line.\n---'), 'One line.')
  assert.equal(parseSkillDescription('---\ndescription: >-\n  First part\n  second part\nname: x\n---'), 'First part second part')
})

test('ticket + plan goes to flowmo with the ticket, not the text', async () => {
  const r = await pick([flowmo, kernel, direct], 'plan', parseTaskInput('HPI-1915 payslip list'), kernelRepo)
  assert.equal(r.orchestrator.name, 'flowmo')
  assert.deepEqual(r.resolution, { kind: 'invoke', invocation: '/flowmo plan HPI-1915' })
  assert.deepEqual(r.skipped, [])
})

test('intake maps to flowmo sync', async () => {
  const r = await pick([flowmo, kernel, direct], 'intake', parseTaskInput('HPI-1915'), kernelRepo)
  assert.equal(r.resolution.kind === 'invoke' && r.resolution.invocation, '/flowmo sync HPI-1915')
})

test('free text skips flowmo and lands on the repo kernel command', async () => {
  const r = await pick([flowmo, kernel, direct], 'plan', parseTaskInput('what would it take to add biometrics'), kernelRepo)
  assert.equal(r.orchestrator.name, 'kernel')
  assert.equal(r.resolution.kind === 'invoke' && r.resolution.invocation, '/issue what would it take to add biometrics')
  assert.deepEqual(r.skipped, [{ name: 'flowmo', reason: 'needs a ticket key' }])
})

test('refresh is NERV-owned even when the repo ships its own /sync', async () => {
  const r = await pick([nerv, flowmo, kernel, direct], 'refresh', parseTaskInput(''), kernelRepo)
  assert.equal(r.orchestrator.name, 'nerv')
  assert.equal(r.resolution.kind, 'playbook')
  assert.ok(r.resolution.kind === 'playbook' && r.resolution.playbook.endsWith('playbooks/refresh.md'))
  assert.equal(await kernel.supports('refresh', parseTaskInput(''), kernelRepo), 'kernel-repo has no refresh command')
})

test('nerv declines every mode it does not own', async () => {
  for (const m of ['ticket', 'plan', 'implement', 'intake', 'ship'] as const) {
    assert.notEqual(await nerv.supports(m, parseTaskInput('HPI-1'), kernelRepo), true, m)
  }
})

test('ship maps to the repo kernel command', async () => {
  const ship = await pick([nerv, flowmo, kernel, direct], 'ship', parseTaskInput(''), skillsOnlyRepo)
  assert.equal(ship.resolution.kind === 'invoke' && ship.resolution.invocation, '/ship')
})

test('repo without a matching command falls back to its skills as context', async () => {
  const r = await pick([flowmo, kernel, direct], 'implement', parseTaskInput('add a dark mode toggle'), skillsOnlyRepo)
  assert.equal(r.orchestrator.name, 'kernel')
  assert.equal(r.resolution.kind, 'context')
  assert.deepEqual(r.resolution.skills?.map(s => s.name), ['git-workflow', 'mobile-app'])
})

test('mode the repo cannot serve falls through to direct with reasons', async () => {
  const r = await pick([flowmo, kernel, direct], 'intake', parseTaskInput('refresh it'), skillsOnlyRepo)
  assert.equal(r.orchestrator.name, 'direct')
  assert.deepEqual(r.skipped.map(s => s.name), ['flowmo', 'kernel'])
})

test('flowmo refuses repos it does not know', async () => {
  assert.equal(await flowmo.supports('plan', parseTaskInput('HPI-1'), bareRepo), 'bare-repo not in flowmo related-repos')
})

test('chain order is respected when swapped', async () => {
  const r = await pick([kernel, flowmo, direct], 'plan', parseTaskInput('HPI-1915'), kernelRepo)
  assert.equal(r.orchestrator.name, 'kernel')
})

test('empty-handed chain throws with every reason', async () => {
  await assert.rejects(pick([flowmo, kernel], 'refresh', parseTaskInput(''), bareRepo), (err: unknown) => {
    assert.ok(err instanceof NoOrchestrator)
    assert.deepEqual(err.skipped.map(s => s.name), ['flowmo', 'kernel'])
    return true
  })
})

test('ticket creates via sprintmo with the repo as routing context', async () => {
  const r = await pick([nerv, sprintmo, flowmo, kernel, direct], 'ticket', parseTaskInput('add a dark mode toggle'), kernelRepo)
  assert.equal(r.orchestrator.name, 'sprintmo')
  assert.deepEqual(r.resolution, { kind: 'invoke', invocation: '/sprintmo:ticket add a dark mode toggle (repo: kernel-repo)' })
})

test('ticket without a description is declined by sprintmo', async () => {
  assert.equal(await sprintmo.supports('ticket', parseTaskInput(''), kernelRepo), 'needs a description of the work')
})

test('sprintmo declines every mode except ticket', async () => {
  for (const m of ['intake', 'plan', 'implement', 'refresh', 'ship'] as const) {
    assert.notEqual(await sprintmo.supports(m, parseTaskInput('HPI-1 x'), kernelRepo), true, m)
  }
})
