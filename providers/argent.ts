import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { stat } from 'node:fs/promises'
import type { DeviceProvider, DeviceInfo, Screenshot, DeviceResult } from '../lib/types.js'

const exec = promisify(execFile)

const MOBILE_REPOS = [
  join(homedir(), 'Projects', 'elmo-learning-mobile-app'),
  join(homedir(), 'Projects', 'rg-mobile-app'),
]

async function findMobileRepo(): Promise<string | null> {
  for (const repo of MOBILE_REPOS) {
    try {
      const mcpPath = join(repo, '.mcp.json')
      await stat(mcpPath)
      return repo
    } catch {
      continue
    }
  }
  return null
}

async function argentCli(args: string[], cwd?: string): Promise<string> {
  const repo = cwd ?? await findMobileRepo()
  if (!repo) throw new Error('No mobile repo with Argent MCP found')

  const argentPath = join(repo, 'node_modules', '@swmansion', 'argent', 'dist', 'cli.js')
  const { stdout } = await exec('node', [argentPath, ...args], { cwd: repo, timeout: 30_000 })
  return stdout.trim()
}

const SAFE_UDID = /^[0-9A-Fa-f-]+$|^booted$/

function validateSimId(id: string | undefined): void {
  if (id !== undefined && id !== 'booted' && !SAFE_UDID.test(id)) {
    throw new Error(`Invalid simulator UDID: ${id}`)
  }
}

async function xcrun(args: string[]): Promise<string> {
  const { stdout } = await exec('xcrun', args, { timeout: 15_000 })
  return stdout.trim()
}

function timedResult(start: number, data?: unknown): DeviceResult {
  return {
    success: true,
    provider: 'argent',
    latencyMs: Math.round(performance.now() - start),
    data,
  }
}

const provider: DeviceProvider = {
  name: 'argent',
  tier: 'workflow',

  async listDevices(): Promise<DeviceInfo[]> {
    const devices: DeviceInfo[] = []

    // iOS simulators via simctl
    try {
      const output = await xcrun(['simctl', 'list', 'devices', 'booted', '-j'])
      const data = JSON.parse(output) as { devices: Record<string, Array<{ name: string; udid: string; state: string }>> }
      for (const [runtime, devs] of Object.entries(data.devices)) {
        for (const d of devs) {
          if (d.state === 'Booted') {
            devices.push({
              id: d.udid,
              name: d.name,
              platform: 'ios',
              connected: true,
            })
          }
        }
      }
    } catch {
      // no Xcode / simctl
    }

    // Android via adb (if available)
    try {
      const { stdout } = await exec('adb', ['devices', '-l'], { timeout: 5_000 })
      const lines = stdout.split('\n').slice(1).filter(l => l.trim() && l.includes('device'))
      for (const line of lines) {
        const [id, ...rest] = line.split(/\s+/)
        const props = rest.join(' ')
        const nameMatch = props.match(/model:(\S+)/)
        devices.push({
          id,
          name: nameMatch?.[1] ?? id,
          platform: props.includes('emulator') ? 'emulator' : 'android',
          connected: true,
        })
      }
    } catch {
      // no adb
    }

    return devices
  },

  async screenshot(deviceId?: string): Promise<Screenshot> {
    const start = performance.now()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const localPath = join(tmpdir(), `nerv-screenshot-${timestamp}.png`)

    if (!deviceId || SAFE_UDID.test(deviceId)) {
      const udid = deviceId ?? 'booted'
      validateSimId(udid)
      await xcrun(['simctl', 'io', udid, 'screenshot', localPath])
    } else {
      // Android device
      const remotePath = '/sdcard/nerv-screenshot.png'
      await exec('adb', ['-s', deviceId, 'shell', 'screencap', '-p', remotePath], { timeout: 15_000 })
      await exec('adb', ['-s', deviceId, 'pull', remotePath, localPath], { timeout: 15_000 })
      await exec('adb', ['-s', deviceId, 'shell', 'rm', remotePath], { timeout: 5_000 })
    }

    return {
      path: localPath,
      timestamp: new Date().toISOString(),
      deviceId: deviceId ?? 'booted',
    }
  },

  async tap(x: number, y: number, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    if (!deviceId || deviceId.includes('-')) {
      // iOS — use simctl
      await xcrun(['simctl', 'io', deviceId ?? 'booted', 'tap', String(x), String(y)])
    } else {
      await exec('adb', ['-s', deviceId, 'shell', 'input', 'tap', String(x), String(y)], { timeout: 10_000 })
    }
    return timedResult(start)
  },

  async swipe(startX: number, startY: number, endX: number, endY: number, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    if (!deviceId || deviceId.includes('-')) {
      await xcrun(['simctl', 'io', deviceId ?? 'booted', 'swipe',
        String(startX), String(startY), String(endX), String(endY)])
    } else {
      await exec('adb', ['-s', deviceId, 'shell', 'input', 'swipe',
        String(startX), String(startY), String(endX), String(endY), '300'], { timeout: 10_000 })
    }
    return timedResult(start)
  },

  async typeText(text: string, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    if (!/^[\w .,!?@:/#-]*$/.test(text)) throw new Error('Text contains disallowed characters')
    if (text.length > 500) throw new Error('Text too long (max 500 chars)')

    if (!deviceId || deviceId.includes('-')) {
      await xcrun(['simctl', 'io', deviceId ?? 'booted', 'type', text])
    } else {
      const escaped = text.replace(/ /g, '%s')
      await exec('adb', ['-s', deviceId, 'shell', 'input', 'text', escaped], { timeout: 10_000 })
    }
    return timedResult(start)
  },

  async launchApp(packageName: string, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(packageName)) throw new Error(`Invalid package/bundle: ${packageName}`)

    if (!deviceId || deviceId.includes('-')) {
      await xcrun(['simctl', 'launch', deviceId ?? 'booted', packageName])
    } else {
      await exec('adb', ['-s', deviceId, 'shell', 'monkey', '-p', packageName,
        '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 10_000 })
    }
    return timedResult(start)
  },

  async logcat(lines: number = 100, deviceId?: string): Promise<string> {
    if (!deviceId || deviceId.includes('-')) {
      // iOS — use simctl spawn to get os_log
      const { stdout } = await exec('xcrun', ['simctl', 'spawn', deviceId ?? 'booted',
        'log', 'show', '--last', '1m', '--style', 'compact'], { timeout: 15_000 })
      const logLines = stdout.split('\n')
      return logLines.slice(-lines).join('\n')
    } else {
      const { stdout } = await exec('adb', ['-s', deviceId, 'logcat', '-d', '-t', String(lines)], { timeout: 15_000 })
      return stdout
    }
  },
}

export default provider
