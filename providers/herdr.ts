import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SessionProvider, SessionInfo } from '../lib/types.js'

const exec = promisify(execFile)
const SOCKET_PATH = join(homedir(), '.config', 'herdr', 'herdr.sock')

async function herdrCli(args: string[]): Promise<string> {
  const { stdout } = await exec('herdr', args, { timeout: 5_000 })
  return stdout.trim()
}

interface HerdrWorkspace {
  workspace_id: string
  label: string
  pane_count: number
  tab_count: number
  focused: boolean
}

interface HerdrListResult {
  id: string
  result: {
    type: string
    workspaces: HerdrWorkspace[]
  }
}

const provider: SessionProvider = {
  name: 'herdr',

  async list(): Promise<SessionInfo[]> {
    const raw = await herdrCli(['workspace', 'list'])
    const data = JSON.parse(raw) as HerdrListResult
    return data.result.workspaces.map(w => ({
      workspaceId: w.workspace_id,
      label: w.label,
      paneCount: w.pane_count,
      tabCount: w.tab_count,
      focused: w.focused,
    }))
  },

  async create(label: string): Promise<SessionInfo> {
    const raw = await herdrCli(['workspace', 'create', '--label', label])
    const data = JSON.parse(raw) as { result: HerdrWorkspace }
    const w = data.result
    return {
      workspaceId: w.workspace_id,
      label: w.label,
      paneCount: w.pane_count,
      tabCount: w.tab_count,
      focused: w.focused,
    }
  },

  async attach(workspaceId: string): Promise<void> {
    await herdrCli(['workspace', 'focus', workspaceId])
  },

  async status(): Promise<{ running: boolean; socketPath: string }> {
    try {
      const info = await stat(SOCKET_PATH)
      if (info.isSocket()) {
        await herdrCli(['workspace', 'list'])
        return { running: true, socketPath: SOCKET_PATH }
      }
    } catch {
      // socket doesn't exist or herdr not responding
    }
    return { running: false, socketPath: SOCKET_PATH }
  },
}

export default provider
