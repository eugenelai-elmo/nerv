# NERV v2 — Agentic Substrate Upgrade

## Status: Built — Layers 0-6 complete, Layer 7 (Wiring) green, stack passes 33 checks

## What
Upgrade the NERV command seat from a skill-and-initiative file system into a full agentic substrate with structured routing, persistent sessions, tiered memory, platform-specific skill activation, and cross-device automation.

## Why
NERV v1 solves skill versioning and initiative state. It doesn't solve:
- **Session persistence** — artifact watches drop, context lost on session end, no background work
- **Skill routing** — 40+ skills/plugins, manual selection or heuristic matching
- **Token efficiency** — long sessions bloat context with tool output noise
- **Cross-device testing** — mobile app needs real device/emulator verification
- **Background work** — CI watching, prod monitoring, artifact watching all fragile

## Architecture
Full design: `architecture/v2-nerv-architecture.md`
Implementation plan: `architecture/v2-implementation-plan.md`
Raw Gemini brief: `architecture/v2-brief-gemini-raw.md`

### Components

| Component | Role | Access Path | Status |
|---|---|---|---|
| **Jev** (TypeSafe AI) | Fast routing + scoring + decisions | TypeSafe direct `api.typesafe.ai` | **Live** — scorer 9/9, decisions via hooks |
| **Laya** (OSS) | Local scoring, free, ~21ms warm | Local server `localhost:8421` | **Live** — primary scorer, Jev fallback |
| **Herdr** | Persistent PTY sessions, agent state awareness | Rust binary v0.9.1, Unix socket API | **Live** — workspace w1 persists |
| **OpenViking** (Volcengine) | Tiered context memory (`viking://`) | Local server + MCP plugin | **Built** — provider ready, filesystem fallback active |
| **Argent** (SwiftUI) | iOS/Android device automation via MCP | MCP server in mobile repo | **Built** — configured in elmo-learning-mobile-app |
| **ARTEMIS** (Google) | Android device automation via MCP | MCP server + ADB | **Built** — provider ready, device fallback active |

### Core Insight: Jev as Decision Pre-Filter

Jev sits in front of session hooks, pre-deciding for Claude before the model sees the prompt. Two decisions are live (audience-detection, risk-gate); six more are defined and ready to wire.

Skill routing was moved from Jev hooks to superpowers (in-context) — better accuracy with full conversation context and zero added latency.

## Layered Adoption

| Layer | What | Solves | Status |
|---|---|---|---|
| 0 | Foundation | Skills in git, initiatives versioned, config + types | **Done** |
| 1 | Scorer (Laya + Jev) | Structured scoring via decisions | **Done** — Laya primary (~21ms), Jev fallback (~700ms) |
| 2 | Router | Skill matching by keyword | **Done** — keyword-router (superpowers handles in-context routing) |
| 3 | Session (Herdr) | Sessions survive terminal death | **Done** — workspace w1 persists, socket verified |
| 4 | Memory | Session knowledge persistence + recall | **Done** — filesystem-fallback, recall+persist hooks wired |
| 5 | Mobile (Argent+ARTEMIS) | Device testing as platform skill | **Built** — iOS screenshot works, touch requires Argent MCP |
| 6 | Decisions | Jev pre-decides for Claude | **Done** — 8 definitions, 2 wired to hooks, decide() facade |
| 7 | Wiring (Integration) | Verify layers are functionally connected | **Done** — 6 integration checks, all pass |

## Stack Integrity

`npm run check` runs 33 checks across all 7 layers + wiring. Current status (22 Sep 2026):
- 31 pass, 2 skip (expected: OpenViking not running, ADB not installed)
- 0 fail, 0 warn
- All layers green. Wiring layer verifies hooks call through to their target layers.

## Provider Architecture

Each layer follows the same pattern: `lib/<layer>.ts` facade → `providers/<name>.ts` implementation → `config/providers.json` selection → auto-fallback on failure.

```
config/providers.json
├── scorer:  laya-local         (fallback: jev-typesafe → jev-fallback)
├── router:  keyword-router     (superpowers routes in-context)
├── memory:  filesystem-fallback (upgrade: openviking)
├── device:  argent             (fallback: device-fallback)
└── session: herdr              (fallback: tmux-fallback)
```

Kill switch for any layer: change `config/providers.json` to the fallback provider. One line, instant.

Retired providers (`providers/retired/`): jev-cloudflare, jev-openrouter, jev-router, llm-cloudflare — superseded by direct TypeSafe API + Laya.

## Hook Wiring

| Hook | Event | Layer | Purpose |
|---|---|---|---|
| `audience-gate.sh` | UserPromptSubmit | L1+L6 | Jev detects outward-facing text, reinforces tone-of-voice |
| `memory-recall.sh` | UserPromptSubmit | L4 | Keyword-matches prompt against knowledge/, injects at L1 tier |
| `risk-gate.sh` | PreToolUse:Bash | L1+L6 | Jev warns on destructive/irreversible operations |
| `memory-persist.sh` | Stop | L4 | Extracts research findings from handoff, saves to knowledge/ |
| `radar-inject.sh` | UserPromptSubmit | — | Injects radar + boot status (global hook) |
| `radar-reconcile.sh` | Stop | — | Reconciles radar state (global hook) |

Retired hooks (`hooks/retired/`): skill-router.sh (superpowers replaced), response-depth.sh (audience-gate replaced), route-prompt.ts.

## Decisions

8 decision definitions in `decisions/`. Per-decision provider routing: accuracy-critical decisions (risk-gate, task-delegation) route to jev-typesafe; others use the global scorer (laya-local).

| Decision | Wired | Provider |
|---|---|---|
| audience-detection | Yes (UserPromptSubmit) | global (laya) |
| risk-gate | Yes (PreToolUse:Bash) | jev-typesafe |
| context-loading | Not yet | global |
| module-routing | Not yet | global |
| pr-file-triage | Not yet | global |
| response-depth | Not yet | global |
| task-delegation | Not yet | jev-typesafe |
| ticket-priority | Not yet | global |

## Knowledge Store (Layer 4)

`knowledge/` directory, managed by `lib/memory.ts` via filesystem-fallback provider.
- `knowledge/research/` — tool/API evaluations (laya, jev, skills registries)
- `knowledge/decisions/` — decision rationales (empty, pending population)
- `knowledge/findings/` — session discoveries (empty, pending population)

Separate from `memories/` (cross-repo team memory via `memories` CLI / SQLite). Layer 4 is NERV-internal session knowledge.

## Next Steps

1. **Wire remaining 6 decisions** — context-loading, module-routing, pr-file-triage, task-delegation, ticket-priority need hook entry points
2. **Laya fine-tuning** on NERV decision history — close accuracy gap with Jev on risk-gate
3. **Laya guard_questions()** as prompt injection detector (PreToolUse on MCP tool inputs)
4. **Build `nerv loadout`** — skill procurement command using `docs/nerv-loadout-brief.md`
5. **Auto-start Laya via launchd** — plist exists, not loaded
6. **Install OpenViking** when context bloat becomes measurably painful
7. **Evaluate AST-based wiring check** — upgrade from grep to TypeScript compiler API import tracing

## People

- Eugene — sole builder/user
- No team dependencies — personal tooling

## Links

- Jev docs: https://docs.typesafe.ai/concepts/system-one
- Herdr: herdr.dev
- OpenViking: github.com/volcengine/OpenViking
- ARTEMIS: github.com/google/artemis
- Laya: github.com/convaiinnovations/laya
- Skills marketplace: ~/Projects/elmo-skills-marketplace
