import type { Person, Roster } from './roster.js'
import type { Appraisal, AppraisalItem, SourceResult } from './bloom.js'

function personLine(p: Person): string {
  const bits = [
    p.github ? `gh:${p.github}` : null,
    p.jira ? `jira:${p.jira}` : null,
    Object.keys(p.bloom).length ? `bloom:${Object.keys(p.bloom).join(',')}` : null,
  ].filter(Boolean)
  return `- **${p.name}** (\`${p.id}\`)${bits.length ? ' — ' + bits.join(' · ') : ''}`
}

export function renderRoster(roster: Roster): string {
  const reports = roster.people.filter(p => p.relationship === 'report')
  const team = roster.people.filter(p => p.relationship === 'team')
  const out = ['## Reports', ...(reports.length ? reports.map(personLine) : ['_none_'])]
  if (team.length) out.push('', '## Team', ...team.map(personLine))
  return out.join('\n')
}

// Question-item descriptions are template guidance shared by everyone; only IDP descriptions are the person's own.
function renderItem(item: AppraisalItem, showDescription: boolean): string[] {
  const out = [`**${item.title}**${item.label ? ` _[${item.label}]_` : ''}`]
  if (showDescription && item.description) out.push(item.description)
  if (item.responses.length === 0 && item.actions.length === 0 && !(showDescription && item.description)) out.push('_not filled in_')
  for (const r of item.responses) out.push(`> ${r.value.replace(/\n/g, '\n> ')}${r.author ? `\n> — ${r.author}` : ''}`)
  for (const a of item.actions) out.push(`- ${a}`)
  if (item.notes.length) out.push('', '_Notes:_', ...item.notes.map(n => `- ${n}`))
  return [...out, '']
}

export function renderAppraisal(person: Person, result: SourceResult<Appraisal>, opts: { notesOnly?: boolean } = {}): string {
  if (result.status !== 'ok' || !result.data) {
    return [`## ${person.name} — appraisal`, '', `Bloom: **${result.status}**`, result.hint ? `→ ${result.hint}` : ''].join('\n').trimEnd()
  }
  const a = result.data
  const out = [
    `## ${person.name} — ${a.fy} appraisal`,
    `${a.progressStatus ?? 'status unknown'} · ${a.period.start?.slice(0, 10) ?? '?'} → ${a.period.end?.slice(0, 10) ?? '?'}`,
    '',
  ]
  for (const s of a.sections) {
    const items = opts.notesOnly ? s.items.filter(i => i.notes.length) : s.items
    if (opts.notesOnly && items.length === 0) continue
    // Bloom marks sections without their own workflow as not_applicable; that's not useful to show.
    const status = s.status && s.status !== 'not_applicable' ? ` (${s.status})` : ''
    out.push(`### ${s.title}${status}`, '')
    if (items.length === 0 && s.extra.length === 0) out.push('_empty_', '')
    for (const item of items) out.push(...renderItem(item, s.key === 'idp'))
    for (const e of s.extra) out.push(`- ${e}`)
  }
  if (opts.notesOnly && out.length === 3) out.push('_no notes_')
  return out.join('\n').trimEnd()
}
