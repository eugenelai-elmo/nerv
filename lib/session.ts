import { resolveProvider } from './resolve-provider.js'
import { trace, now } from './trace.js'
import type { SessionInfo, SessionProvider } from './types.js'

async function getProvider(): Promise<SessionProvider> {
  return resolveProvider<SessionProvider>('session')
}

export async function listSessions(): Promise<SessionInfo[]> {
  const start = performance.now()
  const provider = await getProvider()
  const sessions = await provider.list()
  await trace({
    ts: now(),
    hook: 'session.list',
    layer: 'L3:Session',
    provider: provider.name,
    latencyMs: Math.round(performance.now() - start),
    result: `${sessions.length} workspaces`,
  })
  return sessions
}

export async function createSession(label: string): Promise<SessionInfo> {
  const start = performance.now()
  const provider = await getProvider()
  const session = await provider.create(label)
  await trace({
    ts: now(),
    hook: 'session.create',
    layer: 'L3:Session',
    provider: provider.name,
    latencyMs: Math.round(performance.now() - start),
    result: `created ${session.workspaceId}`,
  })
  return session
}

export async function attachSession(workspaceId: string): Promise<void> {
  const provider = await getProvider()
  await provider.attach(workspaceId)
  await trace({
    ts: now(),
    hook: 'session.attach',
    layer: 'L3:Session',
    provider: provider.name,
    result: workspaceId,
  })
}

export async function sessionStatus(): Promise<{ running: boolean; socketPath: string }> {
  const start = performance.now()
  const provider = await getProvider()
  const status = await provider.status()
  await trace({
    ts: now(),
    hook: 'session.status',
    layer: 'L3:Session',
    provider: provider.name,
    latencyMs: Math.round(performance.now() - start),
    result: status.running ? 'running' : 'stopped',
  })
  return status
}
