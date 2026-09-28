// NERV's own mode vocabulary. Orchestrators translate these into their native commands.
export const MODES = ['plan', 'implement', 'pull', 'rebase', 'ship'] as const
export type Mode = typeof MODES[number]

// Modes that act on the branch rather than a task description.
export const TASKLESS_MODES: readonly Mode[] = ['rebase', 'ship']

export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value)
}

export interface TaskInput {
  text: string
  ticket?: string
}

const TICKET_REF = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/

export function parseTaskInput(text: string): TaskInput {
  const ticket = text.match(TICKET_REF)?.[0]
  return ticket ? { text, ticket } : { text }
}
