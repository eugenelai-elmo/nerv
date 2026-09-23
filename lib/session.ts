import { resolveProvider } from './resolve-provider.js'
import type { SessionInfo, SessionProvider } from './types.js'

async function getProvider(): Promise<SessionProvider> {
  return resolveProvider<SessionProvider>('session')
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
