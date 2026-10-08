import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderRoster, renderAppraisal } from './render.js'
import { parseRoster } from './roster.js'
import type { Appraisal } from './bloom.js'

const roster = parseRoster({
  schemaVersion: 1,
  people: [
    { id: 'sam', name: 'Sam Sample', relationship: 'team', github: 'sam-gh' },
    { id: 'alex', name: 'Alex Example', relationship: 'report', bloom: { FY27: 1001 } },
  ],
})
const alex = roster.people[1]

const appraisal: Appraisal = {
  fy: 'FY27', performanceId: 1001, title: 'Performance Appraisal FY27 - Alex Example',
  employee: 'Alex Example', progressStatus: 'In Progress', period: { start: '2026-07-01', end: '2027-06-30' },
  sections: [
    { key: 'goals', sectionId: 11, type: 'question', title: 'Individual Goals & Objectives', status: 'In Progress', extra: [],
      items: [{ id: 101, title: 'Enter goals', description: null, label: null, actions: [], notes: ['Good progress'],
        responses: [{ author: 'Alex Example', reviewer: null, value: 'Ship theming' }] }] },
    { key: 'career', sectionId: 12, type: 'question', title: 'Career', status: null, extra: [],
      items: [{ id: 201, title: 'Strengths', description: null, label: null, actions: [], notes: [], responses: [] }] },
    { key: 'idp', sectionId: 13, type: 'development', title: 'IDP', status: null, extra: [],
      items: [{ id: 301, title: 'System design', description: 'Lead a review', label: 'Technical', actions: ['Run a guild session'], notes: [], responses: [] }] },
  ],
}

test('renderRoster lists reports before team', () => {
  const out = renderRoster(roster)
  assert.ok(out.indexOf('Alex Example') < out.indexOf('Sam Sample'))
  assert.match(out, /Reports/)
  assert.match(out, /Team/)
  assert.match(out, /FY27/)
})

test('renderAppraisal shows header, responses, IDP actions, notes', () => {
  const out = renderAppraisal(alex, { status: 'ok', data: appraisal })
  assert.match(out, /^## Alex Example — FY27 appraisal/m)
  assert.match(out, /In Progress/)
  assert.match(out, /Ship theming/)
  assert.match(out, /Run a guild session/)
  assert.match(out, /Technical/)
  assert.match(out, /Good progress/)
})

test('renderAppraisal marks empty items as not filled in', () => {
  const out = renderAppraisal(alex, { status: 'ok', data: appraisal })
  assert.match(out, /Strengths[\s\S]*_not filled in_/)
})

test('renderAppraisal notesOnly prints only items that have notes', () => {
  const out = renderAppraisal(alex, { status: 'ok', data: appraisal }, { notesOnly: true })
  assert.match(out, /Good progress/)
  assert.doesNotMatch(out, /System design/)
})

test('renderAppraisal non-ok shows status and hint', () => {
  const out = renderAppraisal(alex, { status: 'auth_expired', hint: "interactive: run '! nerv people login'" })
  assert.match(out, /auth_expired/)
  assert.match(out, /nerv people login/)
})

test('renderAppraisal shows period as dates, not timestamps', () => {
  const a = { ...appraisal, period: { start: '2026-07-01T00:00:00+10:00', end: '2027-07-29T23:59:59+10:00' } }
  const out = renderAppraisal(alex, { status: 'ok', data: a })
  assert.match(out, /2026-07-01 → 2027-07-29/)
})

test('renderAppraisal hides template guidance on question items but keeps IDP descriptions', () => {
  const a: Appraisal = { ...appraisal, sections: appraisal.sections.map(s => s.key === 'goals'
    ? { ...s, items: s.items.map(i => ({ ...i, description: 'TEMPLATE GUIDANCE' })) } : s) }
  const out = renderAppraisal(alex, { status: 'ok', data: a })
  assert.doesNotMatch(out, /TEMPLATE GUIDANCE/)
  assert.match(out, /Lead a review/)
})
