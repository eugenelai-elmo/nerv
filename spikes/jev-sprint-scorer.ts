import { score } from '../lib/scorer.js'
import type { Dimension } from '../lib/types.js'

interface TicketContext {
  key: string
  summary: string
  description: string
  epicSummary?: string
  status: string
  assignee?: string
  storyPoints?: number
  labels?: string[]
  sprintName?: string
  daysRemaining?: number
}

const SPRINT_DIMENSIONS: Dimension[] = [
  {
    name: 'risk',
    question: {
      type: 'score',
      instructions:
        'How risky is this ticket to deliver within the sprint? Consider technical complexity, dependencies, unknowns, and potential for regression.',
      criteria: [
        'Low — well-understood, isolated change, no dependencies',
        'Medium — some complexity or one dependency, but manageable',
        'High — significant complexity, multiple dependencies, or touches shared code',
        'Critical — large blast radius, cross-team dependency, or blocking other work',
      ],
    },
  },
  {
    name: 'value',
    question: {
      type: 'score',
      instructions:
        'How much value does completing this ticket deliver to the product and customers?',
      criteria: [
        'Low — internal cleanup, nice-to-have, or no direct user impact',
        'Medium — improves existing experience or unblocks future work',
        'High — directly improves customer experience or enables a key capability',
      ],
    },
  },
  {
    name: 'urgency',
    question: {
      type: 'score',
      instructions:
        'How time-sensitive is this ticket? Consider deadlines, quarter goals, blocking chains, and external commitments.',
      criteria: [
        'Low — no deadline, can defer without consequence',
        'Medium — should land this quarter but not sprint-critical',
        'High — needed this sprint to stay on track for a commitment',
        'Critical — hard deadline, blocks a release, or contractual obligation',
      ],
    },
  },
  {
    name: 'customer_impact',
    question: {
      type: 'choice',
      instructions: 'What is the nature of this ticket\'s impact on customers?',
      criteria: {
        none: 'No direct or indirect customer impact — internal tooling or process only',
        indirect: 'Improves quality, reliability, or developer velocity that eventually benefits customers',
        direct: 'Customer-facing change — they will see or experience the improvement',
        blocking: 'Customers cannot use a feature or product without this — it is a ship gate',
      },
    },
  },
  {
    name: 'okr_alignment',
    question: {
      type: 'choice',
      instructions:
        'How does this ticket align with the team\'s committed OKR goals for the quarter?',
      criteria: {
        committed_pebble: 'Directly contributes to a committed OKR pebble or rock — must ship this quarter',
        below_line: 'Aligns with a below-the-line stretch goal — picked up only if committed work is on track',
        none: 'No OKR alignment — operational, ad-hoc, or exploratory work',
      },
    },
  },
  {
    name: 'user_facing_flow',
    question: {
      type: 'noul',
      instructions:
        'Does this ticket change a user-facing flow — something a customer would see, interact with, or notice in the product UI?',
    },
  },
]

function buildState(ticket: TicketContext): string {
  return JSON.stringify({
    ticket: {
      key: ticket.key,
      summary: ticket.summary,
      description: ticket.description,
      status: ticket.status,
      assignee: ticket.assignee ?? 'Unassigned',
      story_points: ticket.storyPoints ?? 'Not estimated',
      labels: ticket.labels ?? [],
    },
    sprint: {
      name: ticket.sprintName ?? 'Unknown',
      days_remaining: ticket.daysRemaining ?? 'Unknown',
    },
    epic: ticket.epicSummary ? { summary: ticket.epicSummary } : 'No parent epic',
  })
}

function formatResult(result: Awaited<ReturnType<typeof score>>): void {
  console.log(`Provider: ${result.provider} (${result.latencyMs}ms)\n`)

  for (const s of result.scores) {
    const conf = `${(s.confidence * 100).toFixed(0)}%`
    console.log(`  ${s.name}: ${s.answer} (confidence: ${conf})`)

    if (Object.keys(s.probabilities).length > 0) {
      const probs = Object.entries(s.probabilities)
        .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
        .join('  ')
      console.log(`    distribution: ${probs}`)
    }
  }
}

const SAMPLE_TICKET: TicketContext = {
  key: 'LMS-1179',
  summary: 'Theming: incremental feature-flagged primary-colour rollout across the 24 themeable screens',
  description:
    'Rotageek mobile-app theming. Roll the Elmo theme out across the 24 themeable screens incrementally, behind a feature flag, in safely-reversible batches. Depends on feature-flag infra (hard gate). Each change unit is incremental, safely introduced, safely reversed. Rollout in safely-reversible batches behind the flag; batch composition and order are finalised in LMS-1262. Design tokens audit + mapping: Elmo HR tokens → RG colour constants. Navigation drawer uses deepIndigo, babyPowder, BB800. Performance baseline telemetry — measure boot time before/after. Per-batch bug bash with Dave Denton (RG) + Chris.',
  epicSummary: 'Rotageek Mobile App Theming (per-tenant branding)',
  status: 'To Do',
  labels: ['Mobile_OKR'],
  sprintName: 'MOBFE FY27Q1 S6 (16/09-30/09)',
  daysRemaining: 11,
}

async function main() {
  console.log(`Scoring ${SAMPLE_TICKET.key}: ${SAMPLE_TICKET.summary}\n`)

  try {
    const result = await score(buildState(SAMPLE_TICKET), SPRINT_DIMENSIONS)
    formatResult(result)
    console.log(`\nTokens: charged at $0.042/M input via ${result.provider}`)
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    console.log('\nTo run this spike:')
    console.log('  Option A (Cloudflare): CF_ACCOUNT_ID=... CF_API_TOKEN=... npm run score')
    console.log('  Option B (OpenRouter): edit config/providers.json → "jev-openrouter", then OPENROUTER_API_KEY=... npm run score')
  }
}

main()
