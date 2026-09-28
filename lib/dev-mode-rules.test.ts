import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ruleMode } from './dev-mode-rules.js'

test('exploratory phrasing routes to plan', () => {
  for (const t of [
    'what would it take to add biometrics',
    'how should we structure offline caching for payslips',
    'should we migrate navigation to expo-router',
    'scope out push notifications for payslips',
    'compare zustand vs redux for the mobile store',
    'is the payslip list paginated?',
    'HPI-1915 what would it take?',
  ]) {
    assert.deepEqual(ruleMode(t), { mode: 'plan', rule: 'exploratory' }, t)
  }
})

test('concrete changes and bare tickets get no rule', () => {
  for (const t of [
    'add version label to settings screen',
    'fix crash when opening payslip detail',
    'add a dark mode toggle',
    'HPI-1915',
    'pick up LMS-1248',
  ]) {
    assert.equal(ruleMode(t), null, t)
  }
})
