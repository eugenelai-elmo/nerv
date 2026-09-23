import { resolveProvider } from './resolve-provider.js'
import { trace, now } from './trace.js'
import type { DeviceProvider, DeviceInfo, Screenshot, DeviceResult } from './types.js'

let _cachedProvider: DeviceProvider | null = null

async function getProvider(): Promise<DeviceProvider> {
  if (_cachedProvider) return _cachedProvider
  const start = performance.now()
  const provider = await resolveProvider<DeviceProvider>('device')
  await trace({
    ts: now(),
    hook: 'device.resolve',
    layer: 'L5:Mobile',
    provider: provider.name,
    latencyMs: Math.round(performance.now() - start),
  })
  _cachedProvider = provider
  return provider
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const provider = await getProvider()
  return provider.listDevices()
}

export async function screenshot(deviceId?: string): Promise<Screenshot> {
  const provider = await getProvider()
  return provider.screenshot(deviceId)
}

export async function tap(x: number, y: number, deviceId?: string): Promise<DeviceResult> {
  const provider = await getProvider()
  return provider.tap(x, y, deviceId)
}

export async function swipe(startX: number, startY: number, endX: number, endY: number, deviceId?: string): Promise<DeviceResult> {
  const provider = await getProvider()
  return provider.swipe(startX, startY, endX, endY, deviceId)
}

export async function typeText(text: string, deviceId?: string): Promise<DeviceResult> {
  const provider = await getProvider()
  return provider.typeText(text, deviceId)
}

export async function launchApp(packageName: string, deviceId?: string): Promise<DeviceResult> {
  const provider = await getProvider()
  return provider.launchApp(packageName, deviceId)
}

export async function logcat(lines?: number, deviceId?: string): Promise<string> {
  const provider = await getProvider()
  return provider.logcat(lines, deviceId)
}
