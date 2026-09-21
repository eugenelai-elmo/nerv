# NERV v2 — Agentic Substrate Upgrade

## Status: Discovery / Phase 0

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
Raw Gemini brief: `architecture/v2-brief-gemini-raw.md`

### Components

| Component | Role | Access Path | Status |
|---|---|---|---|
| **Jev** (TypeSafe AI) | Fast routing + scoring + skill selection | Cloudflare Workers AI `typesafe/jev` | Spike done, needs CF auth |
| **Herdr** | Persistent PTY sessions, agent state awareness | Rust binary, Unix socket API | Not installed |
| **OpenViking** (Volcengine) | Tiered context memory (`viking://`) | Local server + MCP plugin | Not installed |
| **ARTEMIS** (Google) | Android device automation via MCP | MCP server + ADB | Not installed |
| **Pizza Bot** (AWS) | Background agent inbox UI | Desktop app, LangGraph | Not evaluated, likely unnecessary |

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
| 1 | Jev scoring | Sprint ticket scoring, PR file triage | **Spike done** — needs CF auth to run |
| 2 | Jev skill routing | Auto-select skills per prompt | Not started |
| 3 | Herdr persistence | Sessions survive, watches don't drop | Not started |
| 4 | OpenViking memory | Tiered context, no token bloat | Not started |
| 5 | ARTEMIS mobile | Device testing as platform skill | Not started |
| 6 | Pizza Bot UI | Background agent inbox | Evaluate after L1-5 |

## Phase 0 — Validation (this week)

1. **Wire Jev via Cloudflare** — `! npx wrangler login`, then run `spikes/jev-sprint-scorer.ts` against S6 tickets. Compare Jev scores to hand-ranked refinement.
2. **Install Herdr** — run Claude Code in a Herdr pane, verify session persistence across detach/reattach.
3. **Prototype skill router** — standalone script, 10 real prompts, check Jev picks the right skills >80%.

## Decisions

- **2026-09-21:** Jev access via Cloudflare Workers AI (no waitlist, free tier). OpenRouter also available as fallback.
- **2026-09-21:** ARTEMIS fits as a platform-specific skill alongside existing mobile marketplace plugins, not a standalone layer.
- **2026-09-21:** Pizza Bot is Layer 6 (evaluate last) — Herdr + Claude Code's task system may cover the use case.

## Open Questions

- Jev calibration accuracy for skill routing (not just classification) — unproven
- Herdr socket API stability — single developer, 105 days old
- OpenViking vs Claude Code auto-memory — overlap, need to measure actual token savings
- Hook latency budget — Jev adds 70-500ms per prompt, acceptable for complex tasks, annoying for quick questions

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
