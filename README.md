# NERV — Agentic Substrate

Cross-repo command seat for Claude Code sessions. Jev-powered routing and decisions, persistent sessions, tiered memory, device automation, and a decision registry that makes Claude faster at the judgment calls you make every day.

Previously `ai-kernel` (memory substrate experiment). Revived and renamed Sep 2026.

## Stack

```
L0  Foundation     54 skills, 5 provider sections, TypeScript
L1  Scorer         Jev via TypeSafe — ticket scoring, PR file triage
L2  Router         Jev skill selection per prompt (live hook, 54 skills)
L3  Session        Herdr — sessions survive terminal death
L4  Memory         Tiered recall (filesystem now, OpenViking when ready)
L5  Device         ARTEMIS-ready (device fallback now, ADB when ready)
L6  Decisions      8 JSON-defined Jev decisions — drop a file to add more
```

Every layer has a fallback provider. Kill switch = one-line config change.

## Quick Start

```bash
cd ~/projects/nerv && claude          # command seat (daily ops)
npm run check                         # structural integrity (25 checks)
npm run check:verbose                 # same, with detail
```

## Structure

```
lib/                                  # Layer facades
  scorer.ts                           # L1 — score(state, dimensions)
  router.ts                           # L2 — route(prompt)
  session.ts                          # L3 — listSessions(), sessionStatus()
  memory.ts                           # L4 — recall(path, tier), save(), list()
  device.ts                           # L5 — screenshot(), tap(), swipe(), logcat()
  decide.ts                           # L6 — decide(name, state)
  types.ts                            # Shared types for all layers

providers/                            # Provider implementations
  jev-typesafe.ts                     # L1 scorer via TypeSafe direct
  jev-router.ts                       # L2 router via Jev noul questions
  keyword-router.ts                   # L2 fallback — regex/keyword matching
  herdr.ts                            # L3 via Herdr socket API
  tmux-fallback.ts                    # L3 fallback — plain tmux
  openviking.ts                       # L4 via OpenViking REST API
  filesystem-fallback.ts              # L4 fallback — plain file reads with tiering
  artemis.ts                          # L5 via ADB
  device-fallback.ts                  # L5 fallback — graceful stubs
  jev-cloudflare.ts                   # Alternative scorer provider
  jev-openrouter.ts                   # Alternative scorer provider
  jev-fallback.ts                     # Scorer fallback — returns "unknown"

decisions/                            # L6 — Jev decision definitions (JSON)
  task-delegation.json                # TL priority framework (do/delegate/escalate/decline)
  risk-gate.json                      # Destructive operation detection
  response-depth.json                 # Calibrate answer detail level
  pr-file-triage.json                 # Review priority per file
  module-routing.json                 # Route prompt to the right repo
  audience-detection.json             # Adjust tone for audience
  ticket-priority.json                # Multi-dimensional sprint scoring
  context-loading.json                # Decide which files to load

config/
  providers.json                      # Active provider per layer
  skill-inventory.json                # 54 registered skills for the router

checks/
  check-stack.ts                      # 25 smoke tests across all 7 layers

hooks/
  skill-router.sh                     # UserPromptSubmit hook — Jev routes every prompt
  route-prompt.ts                     # Hook implementation

initiatives/                          # Cross-repo initiative state
observatory/                          # Deep observability workspace
skills/                               # Manager stack skills (versioned)
spikes/                               # Exploration spikes
```

## Adding a Decision

Drop a JSON file in `decisions/`:

```json
{
  "name": "my-decision",
  "description": "What this decides",
  "dimensions": [
    {
      "name": "answer",
      "question": {
        "type": "choice",
        "instructions": "Given the context, which option?",
        "criteria": {
          "option-a": "When to pick A",
          "option-b": "When to pick B"
        }
      }
    }
  ]
}
```

Use it: `decide('my-decision', 'the context/state string')` → returns the decision + calibrated probabilities in ~300ms.

Jev question types:
- **Choice** — pick one from N options
- **Score** — ordered levels (low→high)
- **Noul** — boolean probability (0.0–1.0)

## Provider Config

```json
// config/providers.json
{
  "scorer":  { "provider": "jev-typesafe" },
  "router":  { "provider": "jev-router" },
  "memory":  { "provider": "filesystem-fallback" },
  "device":  { "provider": "device-fallback" },
  "session": { "provider": "herdr" }
}
```

Change any provider to its fallback (or back) with one edit. No code changes.

## Activating Optional Layers

**OpenViking (L4 Memory):** Install + start server → change `memory.provider` to `"openviking"`.

**ARTEMIS (L5 Device):** Install ADB + ARTEMIS MCP → change `device.provider` to `"artemis"`.

Both degrade gracefully to their fallbacks when the external dependency isn't available.

## Routing Rule

| Layer | Owns | Does not own |
|---|---|---|
| `initiatives/` | Mutable working state for long-running efforts | Repo-specific execution artifacts |
| `skills/` | Manager stack skill definitions (versioned) | Repo-level dev skills (those stay in their repos) |
| `decisions/` | Jev decision definitions | Runtime decision logs |
| `observatory/` | Deep observability context and queries | Daily quick-pulse (that's sitrep) |
| Per-repo `.ai/` | Repo-specific execution state | Initiative-level context |
| Claude Code memory | User preferences, feedback rules, references | Initiative working state |

## Repos

See `CLAUDE.md` for the full repo table and conventions.
