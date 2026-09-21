import { score } from '../lib/scorer.js'
import type { Dimension } from '../lib/types.js'

interface Ticket {
  key: string
  summary: string
  description: string
  epicSummary: string
  status: string
  assignee: string
  storyPoints: string
}

const SPRINT_DIMENSIONS: Dimension[] = [
  {
    name: 'risk',
    question: {
      type: 'score',
      instructions: 'How risky is this ticket to deliver within a 2-week sprint? Consider technical complexity, dependencies, unknowns, and potential for regression.',
      criteria: ['Low', 'Medium', 'High', 'Critical'],
    },
  },
  {
    name: 'value',
    question: {
      type: 'score',
      instructions: 'How much value does completing this ticket deliver to the product and customers?',
      criteria: ['Low', 'Medium', 'High'],
    },
  },
  {
    name: 'urgency',
    question: {
      type: 'score',
      instructions: 'How time-sensitive is this ticket? This is the LAST sprint of Q1 FY27 (ends 30 Sep). The quarter OKR target for theming is PRODUCT READY. Consider deadlines, quarter goals, blocking chains.',
      criteria: ['Low', 'Medium', 'High', 'Critical'],
    },
  },
  {
    name: 'customer_impact',
    question: {
      type: 'choice',
      instructions: "What is the nature of this ticket's impact on customers?",
      criteria: {
        none: 'No direct or indirect customer impact',
        indirect: 'Improves quality or velocity that eventually benefits customers',
        direct: 'Customer-facing change — they will see or experience it',
        blocking: 'Customers cannot use a feature without this — it is a ship gate',
      },
    },
  },
  {
    name: 'okr_alignment',
    question: {
      type: 'choice',
      instructions: "How does this ticket align with Q1 FY27 OKR goals? Committed pebbles: ELMO theming across mobile (GA Launch), Mobile app consolidation (Discovery Complete). Below-line: E2E testing, Quality test automation.",
      criteria: {
        committed_pebble: 'Directly contributes to a committed OKR pebble — must ship this quarter',
        below_line: 'Below-the-line stretch goal — picked up if committed work is on track',
        none: 'No OKR alignment — operational or ad-hoc',
      },
    },
  },
  {
    name: 'user_facing',
    question: {
      type: 'noul',
      instructions: 'Does this ticket change something a customer would see or interact with in the product UI?',
    },
  },
]

const S6_TICKETS: Ticket[] = [
  {
    key: 'LMS-1179',
    summary: 'Theming: incremental feature-flagged primary-colour rollout across 24 themeable screens',
    description: 'Roll the Elmo theme out across 24 themeable screens incrementally, behind a feature flag, in safely-reversible batches. Depends on feature-flag infra (hard gate). Design tokens audit + mapping. Per-batch bug bash.',
    epicSummary: 'Rotageek Mobile App Theming (per-tenant branding)',
    status: 'To Do', assignee: 'Unassigned', storyPoints: 'Not estimated',
  },
  {
    key: 'LMS-1157',
    summary: 'Ship JS/token theme changes via CodePush OTA',
    description: 'JS/token theming can ship OTA; native shell changes need a store release. Depends on spike LMS-1128 confirming CodePush status (now Closed). Implements the confirmed OTA path.',
    epicSummary: 'Rotageek Mobile App Theming (per-tenant branding)',
    status: 'To Do', assignee: 'Unassigned', storyPoints: 'Not estimated',
  },
  {
    key: 'LMS-1159',
    summary: 'Theme-parity ship-gate verification (merged-app readiness)',
    description: 'End-to-end verification that MVP theming works across representative tenants before release. Ship-gate for the app merge (LMS-1073 §4). Gates on build stories above.',
    epicSummary: 'Rotageek Mobile App Theming (per-tenant branding)',
    status: 'To Do', assignee: 'Unassigned', storyPoints: 'Not estimated',
  },
  {
    key: 'LMS-1128',
    summary: 'Spike: Rotageek theming using the ELMO theming API',
    description: 'Discovery spike for how to make Rotageek consume the ELMO theming API. Brand source, API contract, storage model, CodePush status, ownership. Already completed and closed.',
    epicSummary: 'Rotageek / Elmo app merge',
    status: 'Closed', assignee: 'None', storyPoints: 'N/A',
  },
  {
    key: 'LMS-1270',
    summary: 'Bump rn-pendo-sdk to 3.14+ (iOS analytics data fix, Dec 10 deadline)',
    description: 'Pendo SDK versions 3.11-3.13 have a bug causing iOS analytics events to go unidentified. Mobile app is on ^3.13.0. Must update by Dec 10 for iOS 27 support. Small, well-scoped.',
    epicSummary: 'None',
    status: 'To Do', assignee: 'Unassigned', storyPoints: 'Not estimated',
  },
  {
    key: 'LMS-1190',
    summary: 'Heartbeat smoke test: Learning loads and is healthy on the mobile app',
    description: 'Automated Maestro heartbeat check that Learning area launches and primary screen loads. Part of per-service smoke-test suite for release candidates.',
    epicSummary: 'Observability and Error Monitoring',
    status: 'To Do', assignee: 'Unassigned', storyPoints: '2',
  },
  {
    key: 'LMS-1192',
    summary: 'Heartbeat smoke test: Search loads and is healthy on the mobile app',
    description: 'Automated Maestro heartbeat check that Search area launches and accepts input. Part of per-service smoke-test suite.',
    epicSummary: 'Observability and Error Monitoring',
    status: 'To Do', assignee: 'Unassigned', storyPoints: '2',
  },
  {
    key: 'LMS-1193',
    summary: 'Heartbeat smoke test: More loads and is healthy on the mobile app',
    description: 'Automated Maestro heartbeat check that More area launches. Part of per-service smoke-test suite.',
    epicSummary: 'Observability and Error Monitoring',
    status: 'To Do', assignee: 'Unassigned', storyPoints: '2',
  },
  {
    key: 'LMS-1194',
    summary: 'Heartbeat smoke test: Push notifications loads and is healthy on the mobile app',
    description: 'Automated Maestro heartbeat check that Push notifications area renders. Part of per-service smoke-test suite.',
    epicSummary: 'Observability and Error Monitoring',
    status: 'To Do', assignee: 'Unassigned', storyPoints: '2',
  },
]

function buildState(t: Ticket): string {
  return JSON.stringify({
    ticket: { key: t.key, summary: t.summary, description: t.description, status: t.status, assignee: t.assignee, story_points: t.storyPoints },
    sprint: { name: 'MOBFE FY27Q1 S6 (16/09-30/09)', days_remaining: 9, is_last_sprint_of_quarter: true },
    epic: { summary: t.epicSummary },
    quarter_context: 'Q1 FY27. Committed OKR pebbles: ELMO theming across mobile (GA Launch target, currently At Risk), Mobile app consolidation (Discovery Complete). Below commitment line: E2E testing, Quality test automation, Expo v55 upgrade.',
  })
}

async function main() {
  console.log('MOBFE S6 Sprint Refinement — Jev Batch Scoring')
  console.log('='.repeat(55))
  console.log()

  const results: Array<{ key: string; summary: string; scores: Record<string, { answer: string | number | boolean; confidence: number }> }> = []

  for (const ticket of S6_TICKETS) {
    process.stdout.write(`${ticket.key}... `)
    try {
      const result = await score(buildState(ticket), SPRINT_DIMENSIONS)
      const scores: Record<string, { answer: string | number | boolean; confidence: number }> = {}
      for (const s of result.scores) {
        scores[s.name] = { answer: s.answer, confidence: s.confidence }
      }
      results.push({ key: ticket.key, summary: ticket.summary, scores })
      console.log(`done (${result.latencyMs}ms)`)
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`)
      results.push({ key: ticket.key, summary: ticket.summary, scores: {} })
    }
  }

  console.log()
  console.log('RESULTS')
  console.log('='.repeat(55))

  const header = `${'Key'.padEnd(12)} ${'Risk'.padEnd(10)} ${'Value'.padEnd(8)} ${'Urgency'.padEnd(10)} ${'Impact'.padEnd(10)} ${'OKR'.padEnd(18)} UF`
  console.log(header)
  console.log('-'.repeat(header.length))

  for (const r of results) {
    const s = r.scores
    const risk = String(s.risk?.answer ?? '?').substring(0, 8)
    const value = String(s.value?.answer ?? '?').substring(0, 6)
    const urgency = String(s.urgency?.answer ?? '?').substring(0, 8)
    const impact = String(s.customer_impact?.answer ?? '?').substring(0, 8)
    const okr = String(s.okr_alignment?.answer ?? '?').substring(0, 16)
    const uf = s.user_facing?.answer === true ? 'Y' : s.user_facing?.answer === false ? 'N' : '?'
    console.log(`${r.key.padEnd(12)} ${risk.padEnd(10)} ${value.padEnd(8)} ${urgency.padEnd(10)} ${impact.padEnd(10)} ${okr.padEnd(18)} ${uf}`)
  }
}

main()
