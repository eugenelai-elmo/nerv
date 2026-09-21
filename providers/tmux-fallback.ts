import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SessionProvider, SessionInfo } from '../lib/types.js'

const exec = promisify(execFile)

async function tmux(args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('tmux', args, { timeout: 5_000 })
    return stdout.trim()
  } catch {
    return ''
  }
}

const provider: SessionProvider = {
  name: 'tmux-fallback',

  async list(): Promise<SessionInfo[]> {
    const raw = await tmux(['list-sessions', '-F', '#{session_name}:#{session_windows}'])
    if (!raw) return []
    return raw.split('\n').filter(Boolean).map((line, i) => {
      const [name, windows] = line.split(':')
      return {
        workspaceId: name,
        label: name,
        paneCount: 1,
        tabCount: parseInt(windows, 10) || 1,
        focused: i === 0,
      }
    })
  },

  async create(label: string): Promise<SessionInfo> {
    await tmux(['new-session', '-d', '-s', label])
    return {
      workspaceId: label,
      label,
      paneCount: 1,
      tabCount: 1,
      focused: false,
    }
  },

  async attach(workspaceId: string): Promise<void> {
    await tmux(['switch-client', '-t', workspaceId])
  },

  async status(): Promise<{ running: boolean; socketPath: string }> {
    const raw = await tmux(['info'])
    return {
      running: raw.length > 0,
      socketPath: '/tmp/tmux-default',
    }
  },
}

export default provider
