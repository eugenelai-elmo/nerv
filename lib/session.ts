import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { SessionInfo, SessionProvider, ProviderConfig } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadConfig(): Promise<ProviderConfig> {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  return JSON.parse(raw) as ProviderConfig
}

async function loadProvider(name: string): Promise<SessionProvider> {
  const mod = await import(join(ROOT, 'providers', `${name}.js`)) as { default: SessionProvider }
  return mod.default
}

async function getProvider(): Promise<SessionProvider> {
  const config = await loadConfig()
  const providerName = config.session.provider
  try {
    return await loadProvider(providerName)
  } catch (err) {
    if (providerName === 'tmux-fallback') throw err
    console.error(`[session] ${providerName} failed: ${(err as Error).message}, falling back`)
    return await loadProvider('tmux-fallback')
  }
}

export async function listSessions(): Promise<SessionInfo[]> {
  const provider = await getProvider()
  return provider.list()
}

export async function createSession(label: string): Promise<SessionInfo> {
  const provider = await getProvider()
  return provider.create(label)
}

export async function attachSession(workspaceId: string): Promise<void> {
  const provider = await getProvider()
  return provider.attach(workspaceId)
}

export async function sessionStatus(): Promise<{ running: boolean; socketPath: string }> {
  const provider = await getProvider()
  return provider.status()
}
