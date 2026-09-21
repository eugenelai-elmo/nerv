---
status: draft — pending Eugene's review
date: 2026-09-21
based_on: v2-brief-gemini-raw.md (Gemini-generated), verified and redesigned with primary-source research
---

# NERV v2 Architecture

## 1. Component Audit

### Jev (TypeSafe AI) — Routing & Scoring

**What it is.** A non-autoregressive "System One" model. Three primitives: Choice (pick one from N), Score (ordered levels), Noul (boolean probability). Returns probability distributions, not text. 70–500ms. $0.042/M input tokens, output free.

**API shape.** `POST /v1/systemone` with `{model, state, questions}`. All questions evaluate in parallel against the same state. Available via TypeSafe direct, OpenRouter (`typesafe/jev-1.13`), and Cloudflare Workers AI (`typesafe/jev`). Cloudflare wraps response in `{result: ...}`.

**Maturity.** Launched 15 Sep 2026 — 6 days old. Already on three inference providers. No SDK yet, REST only. Community adoption fast (140K waitlist cleared in 36h). Calibration claims (RLCD) unverified by third parties.

**Relevance.** High. The sprint scorer spike (`spikes/jev-sprint-scorer.ts`) already defines 6 question dimensions. Extends naturally to skill routing (below). Cost is negligible even at high call volume.

### Herdr — Persistent Execution

**What it is.** A Rust binary (~10MB). Server/client architecture: a headless server owns PTY panes and survives detach; a TUI client attaches. Unix domain socket API for programmatic control. Agent-state sidebar (blocked/working/done/idle) via process inspection, no hooks required.

**API shape.** JSON over Unix socket. Can create/destroy workspaces, tabs, panes; send input; stream output; query status. CLI wraps the socket for scripting. SSH tunnel for remote access.

**Maturity.** ~105 days old. 15K GitHub stars. Single full-time developer. Socket API documented at herdr.dev/docs/socket-api/. Inter-agent task delegation is a discussion item (#741), not shipped.

**Relevance.** High. Solves the session-persistence problem directly — Claude Code sessions inside Herdr panes survive terminal death, laptop sleep, and SSH disconnects. The socket API makes it scriptable from NERV skills.

### OpenViking (Volcengine/ByteDance) — Structured Memory

**What it is.** Open-source context database. Organizes agent state as a virtual filesystem under `viking://` — memory (conversation history, learned facts), resources (documents, APIs), and skills (reusable tool definitions). Tiered retrieval: L0 abstract → L1 overview → L2 full source.

**API shape.** Local server with REST and MCP interfaces. Claude Code integration exists as a first-party plugin: stdio bridge to `/mcp` endpoint, auto-injects developer profile + session summary. Exposes retrieval, memory, resource, watch, filesystem, and code-navigation tools.

**Maturity.** 30K+ GitHub stars. VLDB 2026 paper (VikingMem). Claude Code memory plugin documented. Production-backed by ByteDance's internal infra.

**Relevance.** Medium-high. Solves context bloat by tiered loading (only pull L2 when needed). The Claude Code MCP plugin means it can be added to NERV v1 with a config change, not a build. The `viking://` filesystem paradigm maps naturally to NERV's `initiatives/`, `skills/`, and `observatory/` structure. However, it partially overlaps with Claude Code's built-in auto-memory and CLAUDE.md.

### AWS Pizza Bot — Human Interface

**What it is.** Open-sourced 10 Sep 2026. An inbox-style UI for background AI agents — not a chat window. Desktop app (macOS/Windows/Linux), browser, terminal. Built on LangChain DeepAgents + LangGraph for stateful execution with checkpointing. Supports Anthropic, Bedrock, Gemini, OpenAI, OpenRouter, Ollama. Extensible via MCP servers and Agent Skills.

**API shape.** Local-first. Agents run as LangGraph graphs with checkpoint persistence. Tasks appear as inbox items with status (running/waiting/done). Human approval gates built in. MCP and Skills for extension.

**Maturity.** 11 days old. Community project, not an AWS service — you own hosting, backups, updates. LangGraph dependency means Python-heavy. Agent Skills support means it can load `.claude/skills/` Markdown directly.

**Relevance.** Medium. Solves the "what are my agents doing?" visibility problem. The inbox metaphor fits the manager-stack workflow — sprint refinement runs in background, surfaces when done, waits for approval if needed. But it introduces a LangGraph dependency and a separate runtime from Claude Code. The question is whether Herdr's sidebar + Claude Code's existing task system already covers this.

### Google ARTEMIS — Mobile Automation

**What it is.** Open-sourced Aug 2026. Turns natural-language instructions into Android device automation. Reactive observe-and-act loop (Flash Mode: 3–5s per step). 99%+ on AndroidWorld benchmark. Native MCP server for Claude Code, Codex, Antigravity, Windsurf.

**API shape.** MCP server exposing device tools (tap, swipe, type, screenshot, logcat, app launch). CLI, web console, Python SDK, and MCP interfaces. Flash and Pro execution profiles.

**Maturity.** Apache 2.0, Google's public GitHub org. MCP integration documented. Requires ADB + connected device or emulator.

**Relevance.** High for mobile work. ELMO's mobile team (React Native/Expo) already has `mobile-tooling` and `rg-mobile` plugins in the skills marketplace. ARTEMIS fills the gap those plugins can't: actual device interaction for testing, bug reproduction, and UI verification. The MCP server means it slots into Claude Code sessions without custom integration.

---

## 2. Critique of the Gemini Brief

**What it gets right:**
- Component selection is sound — all five are real, shipping, and solve distinct problems.
- The dataflow narrative (Jev pre-filter → OpenViking context load → Herdr execution → ARTEMIS device) is a legitimate pipeline.
- The interface abstractions are clean and correctly typed.

**What it gets wrong:**
- The wrangler config binds `HERDR_SOCKET_SERVICE` as a Cloudflare service — Herdr runs locally, not at the edge. You'd need Cloudflare Tunnel or just call Jev as a REST API from local scripts (which works and is simpler).
- "90% token bloat mitigation" and "sub-100ms routing" are unsubstantiated. Jev is 70–500ms. Token savings depend on what you're replacing and haven't been measured.
- "100% LLM cost savings on deterministic bypass" — Jev itself costs tokens. And the routing logic that decides "this is deterministic" is the hard engineering, not the Jev call.
- The interfaces are clean vapor — no implementation behind them. They define what doesn't exist yet and risk becoming a premature abstraction layer nobody needs if the components are called directly.

**What it over-engineers:**
- The Cloudflare Worker as an "edge gateway" for what is fundamentally a local development toolchain. Jev inference calls don't need a deployed Worker — `curl` from a skill script works.
- The IFastRouter `compactTerminalOutput` method — Jev can classify, but "compact terminal output" is a text-generation task it can't do (it returns structured decisions, not text).

**What it misses:**
- **Skill routing.** The brief treats Jev only as a prompt-level router (should this go to Claude or not?). The bigger opportunity is using Jev to route at the *skill* level — given the current task, which of 40+ installed skills/plugins/MCP servers are relevant? This is Eugene's actual insight.
- **The skills marketplace.** ELMO already has `elmo-skills-marketplace` with 15+ plugins across mobile, frontend, design, recruitment, and platform. ARTEMIS doesn't stand alone — it's one tool in a mobile toolchain alongside `mobile-tooling`, `rg-mobile`, `elmo-mobile`, and `flowmo-mobile`. The architecture should describe how Jev helps an agent *pick the right set* from this marketplace.
- **Incremental adoption.** The 4-phase roadmap starts with "stub all interfaces" — that's a big-bang approach. Each component can be adopted independently and should be.

---

## 3. Pragmatic NERV v2 Architecture

### The Core Idea: Jev as Skill Router

The v2 architecture is not five components wired together. It's **Jev sitting in front of everything else, choosing what to activate.**

Today, skill selection is manual — you invoke `/sitrep`, `/eff:review`, `/sprint`, or the Superpowers skill interceptor fires and guesses. With 40+ skills/plugins across 10+ repos, the right tool for the job is increasingly non-obvious.

Jev solves this as a pre-turn classifier:

```
User prompt arrives
        │
        v
   ┌─────────┐
   │   Jev    │  "Given this prompt + workspace context, which skills apply?"
   │ (Choice) │  "Does this need a device?" (Noul)
   │          │  "How complex is this task?" (Score)
   └────┬────┘
        │
        v
   Skill activation set: [eff:review, mobile-tooling, artemis]
        │
        v
   Claude Code executes with the right tools loaded
```

This replaces the Superpowers "check for skills" heuristic with a calibrated, sub-second classifier that knows the full skill inventory.

### Platform-Specific Skill Routing

ARTEMIS is not a standalone layer — it's a **platform-specific skill** that Jev activates when the task involves mobile. The skills marketplace already has the concept:

| Plugin | Platform | When Jev activates it |
|---|---|---|
| `rg-mobile` | React Native (RG) | Working in rg-mobile-app repo |
| `elmo-mobile` | React Native (ELMO) | Working in mobile monorepo |
| `mobile-tooling` | React Native (shared) | Any mobile repo |
| `artemis` (NEW) | Android device | Bug repro, UI verification, E2E on device |
| `eff-review` | Web frontend | PR touches elmo-application |
| `eds-tokens` | Design system | Component styling work |

Jev evaluates: "This prompt mentions a mobile screen bug → activate `rg-mobile` + `mobile-tooling` + `artemis`. Don't load `eff-review` or `eds-tokens`." One Jev call, 6 Choice questions over the skill inventory, ~100ms, pennies.

### Layered Adoption

Each component slots in independently. No big-bang.

**Layer 0 (already done): NERV v1.** Skills in git, initiatives versioned, observatory for deep dives. This is the foundation.

**Layer 1: Jev scoring.** Wire the Cloudflare Workers AI Jev endpoint into the sprint refinement skill and `/eff:review`. Score tickets and files before the LLM reads them. This is the spike already in progress.

**Layer 2: Jev skill routing.** Build a `UserPromptSubmit` hook that calls Jev with the prompt + workspace context + skill inventory. Jev returns which skills are relevant. The hook injects them into the system prompt. Replaces the Superpowers heuristic.

**Layer 3: Herdr for persistence.** Run Claude Code sessions inside Herdr panes. Sessions survive terminal death. The socket API lets NERV skills query sibling sessions, check status, and coordinate. Artifact watches stop dropping.

**Layer 4: OpenViking for memory.** Replace the flat-file auto-memory with OpenViking's MCP plugin. Tiered retrieval means long initiative histories don't bloat context. The `viking://` namespace maps to NERV's directory structure. This is the most optional layer — Claude Code's auto-memory works, OpenViking makes it better.

**Layer 5: ARTEMIS for mobile.** Add ARTEMIS as an MCP server in the mobile workspace. Jev's skill router activates it when the task involves device testing. ARTEMIS captures logs and screenshots; they flow into the initiative's state.

**Layer 6: Pizza Bot for async.** The furthest-out layer. If Herdr + Claude Code's existing task system isn't enough for the "background agent inbox" use case, Pizza Bot provides the UI. But this is the component most likely to be unnecessary — evaluate after Layers 1–5.

---

## 4. Critique of the Redesign

**What could go wrong:**
- **Jev accuracy for skill routing is unproven.** The 6-day-old model has calibration claims but no third-party benchmarks for routing-style tasks. If it misroutes (loads the wrong skills or misses the right one), the session is worse than manual selection. Mitigation: start with Score/Noul (simpler) before Choice (harder). Keep manual override always available.
- **Hook latency budget.** A `UserPromptSubmit` hook that calls Jev adds 70–500ms to every prompt. Acceptable for complex tasks, annoying for quick questions. Mitigation: Jev-route only when the prompt exceeds a character threshold or contains certain trigger patterns; pass through short prompts unchanged.
- **OpenViking dependency.** Adding a local server (OpenViking) to the toolchain adds operational overhead — it needs to be running, healthy, and updated. Claude Code's auto-memory is zero-maintenance. Mitigation: OpenViking is Layer 4, adopt only if auto-memory demonstrably fails.
- **Herdr is single-developer.** 15K stars but one maintainer. If they burn out or pivot, the project could stall. Mitigation: Herdr's value is session persistence — if it dies, the fallback is tmux + manual detach, which works (just isn't agent-aware).

**Assumptions we're making:**
- Jev's calibration is good enough for skill routing (not just classification benchmarks).
- Herdr's socket API is stable enough to build on.
- OpenViking's Claude Code plugin works with the current Claude Code version (plugin ecosystem moves fast).
- ARTEMIS + ADB works reliably with the Expo development build.

**Minimum viable version:**
Layer 0 (done) + Layer 1 (Jev scoring in sprint skill) + Layer 3 (Herdr for persistence). This solves the two most painful problems — "sessions drop" and "sprint tickets aren't scored" — without introducing memory infrastructure or device automation.

---

## 5. Phase 0 — What to Do This Week

1. **Wire Jev via Cloudflare.** Update `spikes/jev-sprint-scorer.ts` to hit `api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run` with model `typesafe/jev`. Run it against the 9 MOBFE S6 tickets. Compare Jev scores to the hand-ranked refinement artifact. This validates whether Jev's calibration is useful, not just correct.

2. **Install Herdr.** `cargo install herdr` or grab the binary. Launch a Claude Code session inside a Herdr pane. Verify: detach, reattach, confirm the session is alive. Test the socket API from a script. This validates persistence before we build on it.

3. **Prototype the skill router.** Write a standalone script (not a hook yet) that takes a prompt string + the list of installed skills (from `~/.claude/skills/` and marketplace plugins) and calls Jev with Choice questions: "Which of these skills are relevant?" Run it against 10 real prompts from recent sessions. If accuracy is >80%, it's worth hooking up.

None of these require deploying anything, changing NERV v1, or installing OpenViking/Pizza Bot/ARTEMIS. They're validation steps for the three components that matter most right now.
