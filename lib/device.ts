import { resolveProvider } from './resolve-provider.js'
import type { DeviceProvider, DeviceInfo, Screenshot, DeviceResult } from './types.js'

async function getProvider(): Promise<DeviceProvider> {
  return resolveProvider<DeviceProvider>('device')
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
