import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitize } from './sanitize.js'

test('plain text is unchanged', () => {
  assert.equal(sanitize('mobile-app — Expo guide (v2)'), 'mobile-app — Expo guide (v2)')
})

test('CSI colour codes are removed whole, no residue', () => {
  assert.equal(sanitize('\x1b[31mred\x1b[0m text'), 'red text')
  assert.ok(!sanitize('\x1b[1;31mx').includes('[31m'))
  assert.equal(sanitize('\x9b31mc1 csi'), 'c1 csi')
})

test('OSC 52 clipboard write is removed', () => {
  assert.equal(sanitize('a\x1b]52;c;ZXZpbA==\x07b'), 'ab')
})

test('OSC 8 hyperlink is removed, visible text kept', () => {
  assert.equal(sanitize('\x1b]8;;https://evil.example\x1b\\click\x1b]8;;\x1b\\'), 'click')
})

test('C0/C1 controls are removed', () => {
  assert.equal(sanitize('a\x07b\x00c\x85d\x7fe'), 'abcde')
})

test('two-char escapes are removed whole (ESC c resets the terminal)', () => {
  assert.equal(sanitize('screen\x1bcreset'), 'screenreset')
  assert.equal(sanitize('trailing\x1b'), 'trailing')
})

test('newlines and tabs are stripped by default, kept on request', () => {
  assert.equal(sanitize('a\nb\tc'), 'abc')
  assert.equal(sanitize('a\nb\tc\x1b[2J', { keepNewlines: true }), 'a\nb\tc')
})
