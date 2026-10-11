#!/usr/bin/env npx tsx
import { main } from '../lib/people/cli.js'

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process
    stderr.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf-8')
    let value = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData)
          stderr.write('\n')
          return resolve(value)
        }
        if (ch === '\u0003') { stdin.setRawMode(false); return reject(new Error('cancelled')) }
        if (ch === '\u007f') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

const code = await main(process.argv.slice(2), {
  stdout: s => process.stdout.write(s + '\n'),
  stderr: s => process.stderr.write(s + '\n'),
  env: process.env,
  isTTY: Boolean(process.stdin.isTTY),
  readSecret,
})
process.exit(code)
