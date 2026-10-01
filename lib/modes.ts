// NERV's own mode vocabulary. Orchestrators translate these into their native commands.
// Lifecycle order: create the ticket, take it in, plan, build, keep the branch fresh, ship.
export const MODES = ['ticket', 'intake', 'plan', 'implement', 'refresh', 'ship'] as const
export type Mode = typeof MODES[number]

// Modes that act on the branch rather than a task description.
export const TASKLESS_MODES: readonly Mode[] = ['refresh', 'ship']

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
