/* eslint-disable no-control-regex */
// Escape sequences are removed whole first (so no "[31m" residue), then any remaining control characters.
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g
const CSI = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g
// Two-char escapes (e.g. ESC c = full terminal reset) — a bare ESC takes the next printable with it.
const OTHER_ESC = /\x1b[ -~]?/g
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g
const CONTROLS_AND_WHITESPACE = /[\x00-\x1f\x7f-\x9f]/g

// Neutralise untrusted text (repo files, API data, user input) before it reaches the terminal.
export function sanitize(str: string, opts: { keepNewlines?: boolean } = {}): string {
  const stripped = str.replace(OSC, '').replace(CSI, '').replace(OTHER_ESC, '')
  return opts.keepNewlines ? stripped.replace(CONTROLS, '') : stripped.replace(CONTROLS_AND_WHITESPACE, '')
}
