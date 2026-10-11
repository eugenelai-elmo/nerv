import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listOrchestrators, loadOrchestrator, OrchestratorNotFound } from './orchestrator-registry.js'

test('lists the orchestrators on disk', async () => {
  const names = await listOrchestrators()
  assert.ok(names.includes('flowmo'))
  assert.ok(names.includes('direct'))
})

test('loads a known orchestrator', async () => {
  const o = await loadOrchestrator('direct')
  assert.equal(o.name, 'direct')
})

test('rejects path traversal and unknown names without importing', async () => {
  for (const name of ['../providers/herdr', '../lib/decide', '/etc/passwd', 'flowmo/../direct', 'bogus', '']) {
    await assert.rejects(loadOrchestrator(name), OrchestratorNotFound, name)
  }
})
