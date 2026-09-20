/**
 * Jev Sprint Ticket Scorer — proof of concept
 *
 * Scores a Jira sprint ticket on 5 decision dimensions using
 * TypeSafe's Jev System One model. Returns calibrated probability
 * distributions, not LLM prose.
 *
 * Usage:
 *   TYPESAFE_API_KEY=ts_... npx tsx spikes/jev-sprint-scorer.ts
 */

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

interface TicketContext {
  key: string;
  summary: string;
  description: string;
  epicSummary?: string;
  status: string;
  assignee?: string;
  storyPoints?: number;
  labels?: string[];
  sprintName?: string;
  daysRemaining?: number;
}

interface JevQuestion {
  type: "choice" | "score" | "noul";
  instructions: string;
  criteria: Record<string, string> | string[];
}

interface JevRequest {
  model: string;
  state: unknown;
  questions: Record<string, JevQuestion>;
}

interface JevAnswer {
  type: string;
  choice?: string;
  score?: number;
  noul?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
  confidence?: number;
}

interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

const SPRINT_QUESTIONS: Record<string, JevQuestion> = {
  risk: {
    type: "score",
    instructions:
      "How risky is this ticket to deliver within the sprint? Consider technical complexity, dependencies, unknowns, and potential for regression.",
    criteria: [
      "Low — well-understood, isolated change, no dependencies",
      "Medium — some complexity or one dependency, but manageable",
      "High — significant complexity, multiple dependencies, or touches shared code",
      "Critical — large blast radius, cross-team dependency, or blocking other work",
    ],
  },
  value: {
    type: "score",
    instructions:
      "How much value does completing this ticket deliver to the product and customers?",
    criteria: [
      "Low — internal cleanup, nice-to-have, or no direct user impact",
      "Medium — improves existing experience or unblocks future work",
      "High — directly improves customer experience or enables a key capability",
    ],
  },
  urgency: {
    type: "score",
    instructions:
      "How time-sensitive is this ticket? Consider deadlines, quarter goals, blocking chains, and external commitments.",
    criteria: [
      "Low — no deadline, can defer without consequence",
      "Medium — should land this quarter but not sprint-critical",
      "High — needed this sprint to stay on track for a commitment",
      "Critical — hard deadline, blocks a release, or contractual obligation",
    ],
  },
  customer_impact: {
    type: "choice",
    instructions:
      "What is the nature of this ticket's impact on customers?",
    criteria: {
      none: "No direct or indirect customer impact — internal tooling or process only",
      indirect:
        "Improves quality, reliability, or developer velocity that eventually benefits customers",
      direct:
        "Customer-facing change — they will see or experience the improvement",
      blocking:
        "Customers cannot use a feature or product without this — it is a ship gate",
    },
  },
  okr_alignment: {
    type: "choice",
    instructions:
      "How does this ticket align with the team's committed OKR goals for the quarter?",
    criteria: {
      committed_pebble:
        "Directly contributes to a committed OKR pebble or rock — must ship this quarter",
      below_line:
        "Aligns with a below-the-line stretch goal — picked up only if committed work is on track",
      none: "No OKR alignment — operational, ad-hoc, or exploratory work",
    },
  },
  user_facing_flow: {
    type: "noul",
    instructions:
      "Does this ticket change a user-facing flow — something a customer would see, interact with, or notice in the product UI?",
  },
};

function buildState(ticket: TicketContext): object {
  return {
    ticket: {
      key: ticket.key,
      summary: ticket.summary,
      description: ticket.description,
      status: ticket.status,
      assignee: ticket.assignee ?? "Unassigned",
      story_points: ticket.storyPoints ?? "Not estimated",
      labels: ticket.labels ?? [],
    },
    sprint: {
      name: ticket.sprintName ?? "Unknown",
      days_remaining: ticket.daysRemaining ?? "Unknown",
    },
    epic: ticket.epicSummary
      ? { summary: ticket.epicSummary }
      : "No parent epic",
  };
}

async function scoreTicket(
  ticket: TicketContext
): Promise<JevResponse> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TYPESAFE_API_KEY not set. Get one at console.typesafe.ai"
    );
  }

  const body: JevRequest = {
    model: JEV_MODEL,
    state: buildState(ticket),
    questions: SPRINT_QUESTIONS,
  };

  const res = await fetch(JEV_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jev API ${res.status}: ${text}`);
  }

  return res.json() as Promise<JevResponse>;
}

function formatAnswer(name: string, answer: JevAnswer): string {
  const lines: string[] = [];

  if (answer.type === "score") {
    const level = Math.round(answer.score!);
    const legendEntry = answer.legend?.[String(level)] ?? `Level ${level}`;
    lines.push(
      `  ${name}: ${legendEntry} (score: ${answer.score!.toFixed(2)}, confidence: ${(answer.confidence! * 100).toFixed(0)}%)`
    );
    if (answer.probabilities) {
      const probs = Object.entries(answer.probabilities)
        .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
        .join("  ");
      lines.push(`    distribution: ${probs}`);
    }
  } else if (answer.type === "choice") {
    lines.push(
      `  ${name}: ${answer.choice} (confidence: ${(answer.confidence! * 100).toFixed(0)}%)`
    );
    if (answer.probabilities) {
      const probs = Object.entries(answer.probabilities)
        .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
        .join("  ");
      lines.push(`    distribution: ${probs}`);
    }
  } else if (answer.type === "noul") {
    const label =
      answer.noul! > 0.7 ? "Yes" : answer.noul! < 0.3 ? "No" : "Uncertain";
    lines.push(
      `  ${name}: ${label} (probability: ${(answer.noul! * 100).toFixed(0)}%)`
    );
  }

  return lines.join("\n");
}

// --- Example: run against a sample ticket ---

const SAMPLE_TICKET: TicketContext = {
  key: "LMS-1179",
  summary:
    "Theming: incremental feature-flagged primary-colour rollout across the 24 themeable screens",
  description:
    "Rotageek mobile-app theming. Roll the Elmo theme out across the 24 themeable screens incrementally, behind a feature flag, in safely-reversible batches. Depends on feature-flag infra (hard gate). Each change unit is incremental, safely introduced, safely reversed. Rollout in safely-reversible batches behind the flag; batch composition and order are finalised in LMS-1262. Design tokens audit + mapping: Elmo HR tokens → RG colour constants. Navigation drawer uses deepIndigo, babyPowder, BB800. Performance baseline telemetry — measure boot time before/after. Per-batch bug bash with Dave Denton (RG) + Chris.",
  epicSummary: "Rotageek Mobile App Theming (per-tenant branding)",
  status: "To Do",
  labels: ["Mobile_OKR"],
  sprintName: "MOBFE FY27Q1 S6 (16/09-30/09)",
  daysRemaining: 11,
};

async function main() {
  console.log(`Scoring ${SAMPLE_TICKET.key}: ${SAMPLE_TICKET.summary}\n`);

  try {
    const response = await scoreTicket(SAMPLE_TICKET);

    console.log("Results:");
    for (const [name, answer] of Object.entries(response.answers)) {
      console.log(formatAnswer(name, answer));
    }

    console.log(
      `\nTokens: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`
    );
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.log("\nTo run this spike:");
    console.log("  1. Sign up at https://typesafe.ai (waitlist)");
    console.log("  2. Get API key at https://console.typesafe.ai");
    console.log(
      "  3. TYPESAFE_API_KEY=ts_... npx tsx spikes/jev-sprint-scorer.ts"
    );
  }
}

main();
