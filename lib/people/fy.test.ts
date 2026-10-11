import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentFy, parseFy } from './fy.js'

test('currentFy: 30 June belongs to the FY ending that year', () => {
  assert.equal(currentFy(new Date(2027, 5, 30)), 'FY27')
})

test('currentFy: 1 July starts the next FY', () => {
  assert.equal(currentFy(new Date(2026, 6, 1)), 'FY27')
})

test('currentFy: October 2026 is FY27', () => {
  assert.equal(currentFy(new Date(2026, 9, 7)), 'FY27')
})

test('parseFy normalises case and whitespace', () => {
  assert.equal(parseFy(' fy28 '), 'FY28')
})

test('parseFy rejects non-FY input', () => {
  assert.equal(parseFy('2027'), null)
  assert.equal(parseFy('FY2027'), null)
})
