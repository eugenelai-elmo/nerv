# NERV v2 — Agentic Substrate Upgrade

## Status: Built — Layers 0-5 complete, stack green

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
| **Jev** (TypeSafe AI) | Fast routing + scoring + skill selection | TypeSafe direct `api.typesafe.ai` | **Live** — scorer 9/9, router 10/10 |
| **Herdr** | Persistent PTY sessions, agent state awareness | Rust binary v0.9.1, Unix socket API | **Live** — workspace w1 persists |
| **OpenViking** (Volcengine) | Tiered context memory (`viking://`) | Local server + MCP plugin | **Built** — provider ready, filesystem fallback active |
| **ARTEMIS** (Google) | Android device automation via MCP | MCP server + ADB | **Built** — provider ready, device fallback active |
| **Pizza Bot** (AWS) | Background agent inbox UI | Desktop app, LangGraph | Deferred — evaluate after L1-5 observation |

### Core Insight: Jev as Skill Router

The v2 architecture is Jev sitting in front of everything, choosing what to activate per prompt. Replaces manual skill selection and the Superpowers heuristic with a calibrated, sub-second classifier that knows the full skill inventory.

```
Prompt arrives → Jev (Choice/Score/Noul) → Skill activation set → Claude Code executes
```

Platform-specific skills (ARTEMIS, mobile-tooling, rg-mobile, eff-review, eds-tokens) get activated by Jev when the task shape matches. The skills marketplace (`elmo-skills-marketplace`) provides the inventory; Jev picks the relevant subset.

## Layered Adoption

| Layer | What | Solves | Status |
|---|---|---|---|
| 0 | NERV v1 | Skills in git, initiatives versioned | **Done** |
| 1 | Jev scoring | Sprint ticket scoring, PR file triage | **Done** — 9/9 via TypeSafe direct |
| 2 | Jev skill routing | Auto-select skills per prompt | **Done** — 10/10 accuracy, live hook, 54 skills |
| 3 | Herdr persistence | Sessions survive, watches don't drop | **Done** — workspace w1 persists across sessions |
| 4 | OpenViking memory | Tiered context, no token bloat | **Built** — filesystem fallback active, OpenViking provider ready |
| 5 | ARTEMIS mobile | Device testing as platform skill | **Built** — device fallback active, ARTEMIS provider ready |
| 6 | Pizza Bot UI | Background agent inbox | Deferred — evaluate after L1-5 |

## Stack Integrity

`npm run check` runs 22 smoke tests across all 6 layers. Current status (21 Sep 2026):
- 18 pass, 4 skip (expected: OpenViking + ADB + ARTEMIS not installed yet)
- 0 fail, 0 warn
- Layers 0-3: all green. Layers 4-5: fallback providers active, primaries ready to activate.

## Provider Architecture

Each layer follows the same pattern: `lib/<layer>.ts` facade → `providers/<name>.ts` implementation → `config/providers.json` selection → auto-fallback on failure.

```
config/providers.json
├── scorer:  jev-typesafe      (fallback: jev-fallback)
├── router:  jev-router        (fallback: keyword-router)
├── memory:  filesystem-fallback (upgrade: openviking)
├── device:  device-fallback    (upgrade: artemis)
└── session: herdr              (fallback: tmux-fallback)
```

Kill switch for any layer: change `config/providers.json` to the fallback provider. One line, instant.

## Decisions

- **2026-09-21:** Jev accessed via TypeSafe direct (`api.typesafe.ai`), not CF Workers AI or OpenRouter (neither hosts Jev).
- **2026-09-21:** ARTEMIS fits as a platform-specific skill alongside existing mobile marketplace plugins, not a standalone layer.
- **2026-09-21:** Pizza Bot is Layer 6 (evaluate last) — Herdr + Claude Code's task system may cover the use case.
- **2026-09-21:** Memory defaults to filesystem-fallback. OpenViking adopted only if token savings measurably >30%.
- **2026-09-21:** Device defaults to device-fallback. ARTEMIS activated when mobile E2E testing begins.

## Next Steps

1. **Observe** the skill router hook in real usage — tune 0.6 threshold if noisy
2. **Install OpenViking** when context bloat becomes measurably painful — flip config to `openviking`
3. **Install ADB + ARTEMIS** when mobile E2E testing begins — flip config to `artemis`
4. **Evaluate Pizza Bot** after 2 weeks of Herdr usage — is the inbox metaphor needed?

## Open Questions

- Jev calibration accuracy in production routing — observed but not yet measured at scale
- Herdr socket API stability — single developer, ~105 days old
- OpenViking vs Claude Code auto-memory — need to measure actual token savings
- Hook latency in practice — Jev adds ~700ms per prompt in real usage

## People

- Eugene — sole builder/user
- No team dependencies — personal tooling

## Links

- Jev docs: https://docs.typesafe.ai/concepts/system-one
- Herdr: herdr.dev
- OpenViking: github.com/volcengine/OpenViking
- ARTEMIS: github.com/google/artemis
- Pizza Bot: github.com/aws/pizza-bot (Apache 2.0)
- Skills marketplace: ~/Projects/elmo-skills-marketplace
