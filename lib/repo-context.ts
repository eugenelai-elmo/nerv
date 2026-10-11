import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import type { RepoContext } from './types.js'

const exec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await exec('git', ['-C', cwd, ...args], { timeout: 5_000 })).stdout.trim()
  } catch {
    return null
  }
}

// Top-level of the checkout at `path`, named after the main repo — so a worktree like
// `elmo-application-HPI-1` still resolves to `elmo-application` for registry lookups.
export async function resolveRepoContext(path: string): Promise<RepoContext | null> {
  const top = await git(path, ['rev-parse', '--show-toplevel'])
  if (!top) return null
  const main = await mainCheckoutPath(top)
  return { name: basename(main ?? top), path: top }
}

// The main checkout a worktree belongs to (itself for a main checkout); null for bare/odd layouts.
export async function mainCheckoutPath(path: string): Promise<string | null> {
  const top = await git(path, ['rev-parse', '--show-toplevel'])
  if (!top) return null
  const common = await git(top, ['rev-parse', '--git-common-dir'])
  const commonAbs = common ? (isAbsolute(common) ? common : resolve(top, common)) : null
  return commonAbs && basename(commonAbs) === '.git' ? dirname(commonAbs) : top
}
