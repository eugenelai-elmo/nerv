import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseSession, readSession, saveSession, KEYCHAIN_SERVICE, type Exec } from './credentials.js'

const SECRET = 'abc123def456ghi789'

test('normaliseSession accepts raw, prefixed, quoted, padded values', () => {
  for (const input of [SECRET, `PHPSESSID=${SECRET}`, `"${SECRET}"`, `  ${SECRET}\n`, `'PHPSESSID=${SECRET}'`]) {
    assert.equal(normaliseSession(input), SECRET)
  }
})

test('normaliseSession rejects header-injection and empty values', () => {
  for (const input of ['', '   ', 'abc;def', 'abc\r\nX-Evil: 1', 'abc def']) {
    assert.equal(normaliseSession(input), null)
  }
})

test('readSession prefers BLOOM_SESSION env', () => {
  const exec: Exec = () => { throw new Error('should not call keychain') }
  assert.equal(readSession({ BLOOM_SESSION: `PHPSESSID=${SECRET}` }, exec), SECRET)
})

test('readSession falls back to keychain', () => {
  const calls: string[][] = []
  const exec: Exec = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: `${SECRET}\n` } }
  assert.equal(readSession({}, exec), SECRET)
  assert.equal(calls[0][0], 'security')
  assert.ok(calls[0].includes('find-generic-password'))
  assert.ok(calls[0].includes(KEYCHAIN_SERVICE))
})

test('readSession returns null when keychain has no entry', () => {
  const exec: Exec = () => ({ status: 44, stdout: '' })
  assert.equal(readSession({}, exec), null)
})

test('saveSession writes normalised value with -U (update)', () => {
  const calls: string[][] = []
  const exec: Exec = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: '' } }
  saveSession(`PHPSESSID=${SECRET}`, exec)
  const args = calls[0]
  assert.ok(args.includes('add-generic-password'))
  assert.ok(args.includes('-U'))
  assert.equal(args[args.indexOf('-w') + 1], SECRET)
})

test('saveSession rejects invalid value without echoing it', () => {
  const exec: Exec = () => ({ status: 0, stdout: '' })
  assert.throws(() => saveSession('bad;value', exec), (e: unknown) => !(e as Error).message.includes('bad;value'))
})

test('saveSession failure message never contains the secret', () => {
  const exec: Exec = () => ({ status: 1, stdout: '' })
  assert.throws(() => saveSession(SECRET, exec), (e: unknown) => !(e as Error).message.includes(SECRET))
})
