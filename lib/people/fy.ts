// Australian financial year: 1 Jul – 30 Jun, labelled by the year it ends.
export function currentFy(now: Date = new Date()): string {
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return `FY${String(endYear % 100).padStart(2, '0')}`
}

export function parseFy(input: string): string | null {
  const m = /^fy(\d{2})$/i.exec(input.trim())
  return m ? `FY${m[1]}` : null
}
