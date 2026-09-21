---
status: draft
date: 2026-09-21
parent: v2-nerv-architecture.md
---

# NERV v2 — Implementation Plan

## Principles

1. **Each layer is independently useful and independently revertable.** No layer depends on a later layer existing. Every layer has a kill switch.
2. **Validate before integrating.** Each layer starts as a standalone spike, gets acceptance-tested, then wires into NERV. The spike is the proof; the integration is the commit.
3. **Fallbacks are first-class.** Every provider has a fallback that works without it. If Jev is down, scoring falls back to the LLM. If Herdr dies, you use a plain terminal. Nothing breaks.
4. **No changes to NERV v1 until a layer passes its gate.** Skills, initiatives, observatory, CLAUDE.md — all untouched until the layer earns its place.

## Layer 1: Scorer (Jev via Cloudflare)

### What it does
Scores sprint tickets (or PR files, or architecture options) on typed dimensions using Jev. Returns calibrated probabilities, not LLM prose.

### Build steps

| Step | What | Output | Risk |
|---|---|---|---|
| 1.1 | `npx wrangler login` — authenticate with personal CF account | CF API token available | None — reversible, personal account |
| 1.2 | Build `lib/scorer.ts` — thin contract: `score(state: string, dimensions: Dimension[]) → DimensionScore[]` | Type definitions + contract | None — types only |
| 1.3 | Build `providers/jev-cloudflare.ts` — implements scorer against CF Workers AI REST endpoint | Working provider | Requires CF auth from 1.1 |
| 1.4 | Build `providers/jev-fallback.ts` — implements scorer by asking Claude to score (same dimensions, structured output) | Fallback provider | Slower, costs more, but always works |
| 1.5 | Update `spikes/jev-sprint-scorer.ts` to use `lib/scorer.ts` instead of raw fetch | Spike uses the contract | None |
| 1.6 | Run scorer against 9 MOBFE S6 tickets — compare Jev scores to hand-ranked refinement | Accuracy report | None — read-only |

### Acceptance gate
- Jev scores match hand-ranking on **priority tier assignment** (not exact scores) for ≥7 of 9 tickets
- Latency < 1s per ticket
- Fallback provider produces comparable tier assignments (may be slower)
- If gate fails: park Layer 1, use LLM-only scoring in sprint skill (the v1 approach from the S6 session)

### Kill switch
Delete `providers/jev-cloudflare.ts`, set `providers.json` to use fallback. Sprint skill still works.

---

## Layer 2: Skill Router (Jev pre-prompt classification)

### What it does
On every prompt, classifies which skills/tools are relevant. Outputs a hint that Claude Code uses to decide what to invoke.

### Prerequisite
Layer 1 gate passed (proves Jev accuracy is usable).

### Build steps

| Step | What | Output | Risk |
|---|---|---|---|
| 2.1 | Build `config/skill-inventory.json` — registry of all skills with metadata (platform, trigger patterns, description) | JSON file listing 40+ skills | None — data file |
| 2.2 | Build `lib/router.ts` — thin contract: `route(prompt: string, inventory: SkillEntry[]) → SkillMatch[]` with confidence scores | Type definitions + contract | None |
| 2.3 | Build `providers/jev-router.ts` — implements router using Jev Choice/Noul questions against the inventory | Working provider | Requires CF auth |
| 2.4 | Build `providers/keyword-router.ts` — fallback: regex/keyword matching against skill trigger patterns (what Superpowers does today, but explicit) | Fallback provider | None |
| 2.5 | **Offline validation**: write `spikes/router-accuracy.ts` — feed 20 real prompts from recent session transcripts, check Jev picks the right skills | Accuracy report (target: >80%) | None — read-only |
| 2.6 | If accuracy passes: build `hooks/skill-router.sh` — UserPromptSubmit hook that calls router, prints relevant skill names as a system-reminder hint | Working hook | Adds 70-500ms latency per prompt |
| 2.7 | Add a prompt-length threshold: skip routing for prompts < 20 chars (quick questions don't need routing) | Latency guard | None |

### Acceptance gate
- Offline accuracy ≥80% on 20 real prompts
- Hook latency < 500ms p95 measured over 50 prompts
- Manual override always works (typing `/skill` directly bypasses the router)
- If gate fails: park Layer 2, keep manual skill selection

### Kill switch
Remove the hook from `.claude/settings.json`. Skill selection goes back to manual. Zero side effects.

---

## Layer 3: Persistence (Herdr)

### What it does
Claude Code sessions run inside Herdr panes. Sessions survive terminal death, laptop sleep, SSH disconnects.

### Prerequisite
None — independent of Layers 1-2.

### Build steps

| Step | What | Output | Risk |
|---|---|---|---|
| 3.1 | Install Herdr binary (`cargo install herdr` or download release) | `herdr` command available | System-level install — reversible via `cargo uninstall` |
| 3.2 | Manual test: launch `herdr`, create a workspace, run `claude` in a pane, detach, reattach | Verified: session survives detach | None |
| 3.3 | Manual test: start an artifact watch in the session, detach for 10 min, reattach — does the watch survive? | Verified: watches persist (or don't — that's the finding) | None |
| 3.4 | Build `lib/session.ts` — thin contract: `createSession() / attachSession() / getStatus() / listSessions()` | Type definitions | None |
| 3.5 | Build `providers/herdr.ts` — implements session contract against Herdr's Unix socket API | Working provider | Depends on socket API stability |
| 3.6 | Build `providers/tmux-fallback.ts` — implements session contract using tmux (basic, no agent-state awareness) | Fallback provider | None |
| 3.7 | Update NERV launch instructions: `herdr → claude` instead of `claude` directly | README + CLAUDE.md update | None |

### Acceptance gate
- Sessions survive: terminal close, laptop sleep (5 min), SSH disconnect
- Socket API responds to status queries from external scripts
- Artifact watches survive detach/reattach (if they don't, document the limitation)
- If gate fails: park Layer 3, continue using plain terminal + handoff files (v1 approach)

### Kill switch
Stop using Herdr. Launch `claude` directly. `cargo uninstall herdr`.

---

## Layer 4: Memory (OpenViking)

### What it does
Tiered context loading. Initiatives load at L0 (abstract) by default, escalate to L1/L2 when actively worked on.

### Prerequisite
Layer 3 ideally (persistent sessions benefit more from smart memory). But can be adopted independently.

### Build steps

| Step | What | Output | Risk |
|---|---|---|---|
| 4.1 | Clone OpenViking, run local server, verify it starts | Running server on localhost:8080 | New local dependency |
| 4.2 | Configure OpenViking MCP plugin in `.mcp.json` (alongside existing servers) | MCP tools available in Claude Code | Adds startup time, may conflict with existing MCP servers |
| 4.3 | Map NERV's directory structure to `viking://` — initiatives/, skills/, observatory/ | Configuration file | None |
| 4.4 | Build `lib/memory.ts` — thin contract: `recall(path, tier) → context` / `save(path, payload)` | Type definitions | None |
| 4.5 | Build `providers/openviking.ts` — implements memory via OpenViking MCP | Working provider | Depends on MCP plugin compatibility |
| 4.6 | Build `providers/filesystem-fallback.ts` — implements memory as plain file reads (what we do today) | Fallback provider | None |
| 4.7 | **Measure**: run 5 sessions with OpenViking, 5 without. Compare context token usage at session mid-point | Token savings report | None — observational |

### Acceptance gate
- Measurable token reduction (≥30% at session midpoint compared to flat-file loading)
- No startup failures or MCP conflicts in 10 consecutive session launches
- L0→L1→L2 escalation works correctly (only the active initiative is fully loaded)
- If gate fails: park Layer 4, keep flat-file auto-memory (it works fine)

### Kill switch
Remove OpenViking from `.mcp.json`. Stop the local server. Memory falls back to auto-memory + file reads.

---

## Layer 5: Mobile Automation (ARTEMIS)

### What it does
Real Android device/emulator automation via MCP. Screenshots, tap, swipe, logcat, app launch.

### Prerequisite
Layer 2 (skill router) — so Jev activates ARTEMIS only for mobile tasks. Can be configured manually without Layer 2.

### Build steps

| Step | What | Output | Risk |
|---|---|---|---|
| 5.1 | Install ARTEMIS MCP server, configure ADB, connect emulator or device | MCP tools available | Requires Android SDK / emulator setup |
| 5.2 | Manual test: from a Claude Code session, invoke ARTEMIS to screenshot the ELMO mobile app on emulator | Working screenshot | Depends on Expo dev build running |
| 5.3 | Add ARTEMIS as a platform-specific skill entry in `config/skill-inventory.json` | Router knows about ARTEMIS | None |
| 5.4 | Test Jev routing: "check the theming on the mobile app" → does Jev activate ARTEMIS? | Routing accuracy | Depends on Layer 2 |
| 5.5 | Wire ARTEMIS logs/screenshots into initiative state (save to `initiatives/<name>/device-captures/`) | Audit trail | None |

### Acceptance gate
- ARTEMIS can screenshot + tap + verify a screen on the ELMO Expo dev build
- Jev correctly activates ARTEMIS for mobile prompts and does NOT activate it for web prompts
- Captured logs are readable and useful for bug diagnosis
- If gate fails: park Layer 5, continue using manual device testing + agent-browser screenshots

### Kill switch
Remove ARTEMIS from `.mcp.json`. Remove from skill inventory. Mobile testing falls back to manual.

---

## Layer 6: Background Agent UI (Pizza Bot)

### What it does
Inbox-style UI for background AI agents. Tasks appear as items with status.

### Prerequisite
Layer 3 (Herdr) evaluated first — Pizza Bot may be unnecessary.

### Build steps
Deferred. Evaluate after Layers 1-5 whether Herdr + Claude Code's task system is sufficient. If not, spec Pizza Bot integration then.

### Acceptance gate
Herdr + Claude Code tasks are demonstrably insufficient for the background-agent use case.

---

## Rollback Plan

Every layer is independent. Rollback is always:
1. Remove the provider config (one line in `providers.json`)
2. The layer falls back to its fallback provider automatically
3. If the fallback is also unwanted, remove the layer's lib file
4. NERV v1 continues working — nothing in v1 depends on v2 layers

**Nuclear rollback**: `git checkout` the commit before any v2 changes. NERV v1 is intact. Every v2 file is in `lib/`, `providers/`, `hooks/`, or `config/` — no v1 files are modified until a layer passes its gate.

---

## Timeline (realistic, not aspirational)

| Week | Focus | Gate |
|---|---|---|
| **This week** | Layer 1 (scorer): CF auth + build lib + run against S6 tickets | Accuracy ≥7/9 tier matches |
| **Next week** | Layer 2 (router): skill inventory + offline accuracy test | ≥80% on 20 prompts |
| **Week 3** | Layer 3 (Herdr): install + manual tests + socket API | Sessions survive detach |
| **Week 4** | Integration: wire scorer into sprint skill, hook up router | Sprint skill works end-to-end |
| **Later** | Layer 4-6 as needed | Token savings, mobile demand |

Each week has one deliverable and one gate. If the gate fails, that layer parks and you move to the next. No cascading delays — the layers are independent.
