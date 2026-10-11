import { spawnSync } from 'node:child_process'
import { userInfo } from 'node:os'

export type Exec = (cmd: string, args: string[]) => { status: number | null; stdout: string }

export const KEYCHAIN_SERVICE = 'nerv-bloom'

const defaultExec: Exec = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  return { status: r.status, stdout: r.stdout ?? '' }
}

// PHPSESSID values are [A-Za-z0-9,-]. Anything else could inject into the Cookie header.
export function normaliseSession(input: string): string | null {
  let v = input.trim().replace(/^['"]|['"]$/g, '').trim()
  v = v.replace(/^PHPSESSID=/i, '')
  return /^[A-Za-z0-9,-]+$/.test(v) ? v : null
}

export function readSession(env: NodeJS.ProcessEnv = process.env, exec: Exec = defaultExec): string | null {
  if (env.BLOOM_SESSION?.trim()) return normaliseSession(env.BLOOM_SESSION)
  const r = exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username, '-w'])
  if (r.status !== 0) return null
  return normaliseSession(r.stdout)
}

export function saveSession(value: string, exec: Exec = defaultExec): void {
  const v = normaliseSession(value)
  if (!v) throw new Error('That does not look like a PHPSESSID value (expected letters, digits, "-" or ",").')
  const r = exec('security', ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username, '-w', v])
  if (r.status !== 0) throw new Error(`Keychain write failed (security exited ${r.status}).`)
}
