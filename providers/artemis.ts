import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DeviceProvider, DeviceInfo, Screenshot, DeviceResult } from '../lib/types.js'

const exec = promisify(execFile)

const SAFE_ID = /^[a-zA-Z0-9._:-]+$/
const SAFE_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_.]*$/
const SAFE_TOOL = /^[a-zA-Z][a-zA-Z0-9_-]*$/

function validateDeviceId(id: string | undefined): void {
  if (id !== undefined && !SAFE_ID.test(id)) {
    throw new Error(`Invalid device ID: ${id}`)
  }
}

async function adb(args: string[], deviceId?: string): Promise<string> {
  validateDeviceId(deviceId)
  const fullArgs = deviceId ? ['-s', deviceId, ...args] : args
  const { stdout } = await exec('adb', fullArgs, { timeout: 15_000 })
  return stdout.trim()
}

async function artemisMcp(tool: string, params: Record<string, unknown>): Promise<unknown> {
  if (!SAFE_TOOL.test(tool)) throw new Error(`Invalid tool name: ${tool}`)
  const baseUrl = process.env.ARTEMIS_MCP_URL ?? 'http://localhost:8700'
  const res = await fetch(`${baseUrl}/mcp/v1/tools/${encodeURIComponent(tool)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ARTEMIS MCP ${res.status}: ${text}`)
  }

  const data = await res.json() as { result: unknown }
  return data.result
}

function timedResult(provider: string, start: number, data?: unknown): DeviceResult {
  return {
    success: true,
    provider,
    latencyMs: Math.round(performance.now() - start),
    data,
  }
}

const provider: DeviceProvider = {
  name: 'artemis',

  async listDevices(): Promise<DeviceInfo[]> {
    const output = await adb(['devices', '-l'])
    const lines = output.split('\n').slice(1).filter(l => l.trim())
    return lines.map(line => {
      const [id, ...rest] = line.split(/\s+/)
      const props = rest.join(' ')
      const nameMatch = props.match(/model:(\S+)/)
      return {
        id,
        name: nameMatch?.[1] ?? id,
        platform: props.includes('emulator') ? 'emulator' as const : 'android' as const,
        connected: props.includes('device'),
      }
    })
  },

  async screenshot(deviceId?: string): Promise<Screenshot> {
    const start = performance.now()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const remotePath = '/sdcard/nerv-screenshot.png'
    const localPath = join(tmpdir(), `nerv-screenshot-${timestamp}.png`)

    await adb(['shell', 'screencap', '-p', remotePath], deviceId)
    await adb(['pull', remotePath, localPath], deviceId)
    await adb(['shell', 'rm', remotePath], deviceId)

    return {
      path: localPath,
      timestamp: new Date().toISOString(),
      deviceId: deviceId ?? 'default',
    }
  },

  async tap(x: number, y: number, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    await adb(['shell', 'input', 'tap', String(x), String(y)], deviceId)
    return timedResult('artemis', start)
  },

  async swipe(startX: number, startY: number, endX: number, endY: number, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    await adb(['shell', 'input', 'swipe', String(startX), String(startY), String(endX), String(endY), '300'], deviceId)
    return timedResult('artemis', start)
  },

  async typeText(text: string, deviceId?: string): Promise<DeviceResult> {
    const start = performance.now()
    if (text.length > 500) throw new Error('Text too long for adb input (max 500 chars)')
    const escaped = text.replace(/ /g, '%s')
    await adb(['shell', 'input', 'text', escaped], deviceId)
    return timedResult('artemis', start)
  },

  async launchApp(packageName: string, deviceId?: string): Promise<DeviceResult> {
    if (!SAFE_PACKAGE.test(packageName)) throw new Error(`Invalid package name: ${packageName}`)
    const start = performance.now()
    await adb(['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'], deviceId)
    return timedResult('artemis', start)
  },

  async logcat(lines: number = 100, deviceId?: string): Promise<string> {
    return adb(['logcat', '-d', '-t', String(lines)], deviceId)
  },
}

export default provider
