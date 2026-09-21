import type { DeviceProvider, DeviceInfo, Screenshot, DeviceResult } from '../lib/types.js'

function notAvailable(action: string): DeviceResult {
  return {
    success: false,
    provider: 'device-fallback',
    latencyMs: 0,
    data: { message: `No device provider available. ${action}` },
  }
}

const provider: DeviceProvider = {
  name: 'device-fallback',
  tier: 'fallback',

  async listDevices(): Promise<DeviceInfo[]> {
    console.warn('[device-fallback] No device provider — install ARTEMIS or connect ADB')
    return []
  },

  async screenshot(): Promise<Screenshot> {
    throw new Error('No device provider available. Install ARTEMIS and connect a device/emulator.')
  },

  async tap(): Promise<DeviceResult> {
    return notAvailable('Connect a device to use tap.')
  },

  async swipe(): Promise<DeviceResult> {
    return notAvailable('Connect a device to use swipe.')
  },

  async typeText(): Promise<DeviceResult> {
    return notAvailable('Connect a device to type text.')
  },

  async launchApp(): Promise<DeviceResult> {
    return notAvailable('Connect a device to launch apps.')
  },

  async logcat(): Promise<string> {
    console.warn('[device-fallback] No device provider — no logcat available')
    return ''
  },
}

export default provider
