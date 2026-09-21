import { route } from '../lib/router.js'

interface TestCase {
  prompt: string
  expectedSkills: string[]
  description: string
}

const TEST_CASES: TestCase[] = [
  {
    prompt: 'review the theming PR on the mobile app, check if it follows our conventions',
    expectedSkills: ['eff-review', 'rg-mobile', 'mobile-tooling'],
    description: 'Mobile PR review',
  },
  {
    prompt: 'what should I do today, catch me up on priorities',
    expectedSkills: ['sitrep', 'inbox'],
    description: 'Morning briefing',
  },
  {
    prompt: 'refine the MOBFE sprint tickets for next sprint against our OKR goals',
    expectedSkills: ['sprintmo:quality', 'sprintmo:sprintmo'],
    description: 'Sprint refinement',
  },
  {
    prompt: 'build me a prototype page for the leave balance dashboard using our design system',
    expectedSkills: ['design-prototype', 'eds-tokens'],
    description: 'Frontend prototype',
  },
  {
    prompt: 'check the Kibana error rates for module federation share_scope_mismatch errors in prod',
    expectedSkills: ['kibana'],
    description: 'Prod error investigation',
  },
  {
    prompt: 'check if the LaunchDarkly flag for security profiles is enabled in production',
    expectedSkills: ['launchdarkly'],
    description: 'Feature flag check',
  },
  {
    prompt: 'decompose the payslips initiative into work items with T-shirt sizing and dependencies',
    expectedSkills: ['breakdown'],
    description: 'Initiative decomposition',
  },
  {
    prompt: 'write the Jira ticket for the Pendo SDK bump using our ticket template',
    expectedSkills: ['sprintmo:ticket'],
    description: 'Ticket authoring',
  },
  {
    prompt: 'run the release notes for the next elmo-application deploy, assess the risk',
    expectedSkills: ['release-notes'],
    description: 'Release prep',
  },
  {
    prompt: 'audit the Figma design for EDS component coverage and check which elements are not from the library',
    expectedSkills: ['figma-eds-audit', 'eds-tokens', 'figma-mcp-workflow'],
    description: 'Figma design audit',
  },
]

async function main() {
  console.log('Skill Router Accuracy Test')
  console.log('='.repeat(60))
  console.log()

  let correct = 0
  let total = 0

  for (const tc of TEST_CASES) {
    total++
    process.stdout.write(`${total}. ${tc.description}... `)

    const result = await route(tc.prompt)
    const matched = result.matches.map(m => m.name)
    const expectedHits = tc.expectedSkills.filter(s => matched.includes(s))
    const accuracy = expectedHits.length / tc.expectedSkills.length

    const pass = accuracy >= 0.5
    if (pass) correct++

    const icon = pass ? 'PASS' : 'MISS'
    console.log(`${icon} (${result.latencyMs}ms, ${result.provider})`)
    console.log(`   Expected: [${tc.expectedSkills.join(', ')}]`)
    console.log(`   Got:      [${matched.join(', ')}]`)
    console.log(`   Hit:      ${expectedHits.length}/${tc.expectedSkills.length}`)
    console.log()
  }

  console.log('='.repeat(60))
  console.log(`Result: ${correct}/${total} (${((correct / total) * 100).toFixed(0)}%)`)
  console.log(`Gate: ${correct / total >= 0.8 ? 'PASSED (≥80%)' : 'FAILED (<80%)'}`)
}

main()
