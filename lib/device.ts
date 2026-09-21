import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { DeviceProvider, DeviceInfo, Screenshot, DeviceResult, ProviderConfig } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadConfig(): Promise<ProviderConfig> {
  const raw = await readFile(join(ROOT, 'config', 'providers.json'), 'utf-8')
  return JSON.parse(raw) as ProviderConfig
}

async function loadProvider(name: string): Promise<DeviceProvider> {
  const mod = await import(join(ROOT, 'providers', `${name}.js`)) as { default: DeviceProvider }
  return mod.default
}

async function getProvider(): Promise<DeviceProvider> {
  const config = await loadConfig()
  const providerName = config.device.provider
  try {
    return await loadProvider(providerName)
  } catch (err) {
    if (providerName === 'device-fallback') throw err
    console.error(`[device] ${providerName} failed: ${(err as Error).message}, falling back`)
    return await loadProvider('device-fallback')
  }
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
