import { resolveAndCall } from './resolve-provider.js'
import { trace, now } from './trace.js'
import type { SessionInfo, SessionProvider } from './types.js'

function call<R>(invoke: (p: SessionProvider) => Promise<R>) {
  return resolveAndCall<SessionProvider, R>('session', invoke)
}

export async function listSessions(): Promise<SessionInfo[]> {
  const { result: sessions, providerName, latencyMs } = await call(p => p.list())
  await trace({
    ts: now(),
    hook: 'session.list',
    layer: 'L3:Session',
    provider: providerName,
    latencyMs,
    result: `${sessions.length} workspaces`,
  })
  return sessions
}

export async function createSession(label: string): Promise<SessionInfo> {
  const { result: session, providerName, latencyMs } = await call(p => p.create(label))
  await trace({
    ts: now(),
    hook: 'session.create',
    layer: 'L3:Session',
    provider: providerName,
    latencyMs,
    result: `created ${session.workspaceId}`,
  })
  return session
}

export async function attachSession(workspaceId: string): Promise<void> {
  const { providerName, latencyMs } = await call(p => p.attach(workspaceId))
  await trace({
    ts: now(),
    hook: 'session.attach',
    layer: 'L3:Session',
    provider: providerName,
    latencyMs,
    result: workspaceId,
  })
}

export async function sessionStatus(): Promise<{ running: boolean; socketPath: string }> {
  const { result: status, providerName, latencyMs } = await call(p => p.status())
  await trace({
    ts: now(),
    hook: 'session.status',
    layer: 'L3:Session',
    provider: providerName,
    latencyMs,
    result: status.running ? 'running' : 'stopped',
  })
  return status
}
