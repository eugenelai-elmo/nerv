---
title: AI Kernel — Architecture & Topology
status: living
last_updated: 2026-04-25
---

# AI Kernel — Architecture & Topology

Single-page entry point. For depth, see:

- [`PLAN.md`](../PLAN.md) — storage model, frontmatter spec, index format, triage contract, phased plan
- [`docs/superpowers/specs/2026-04-25-deployment-and-observability-design.md`](superpowers/specs/2026-04-25-deployment-and-observability-design.md) — C-global deployment, identity, scope filtering, observability

## 1. Components — what's in the box

```mermaid
flowchart TB
  subgraph KERNEL["$AI_KERNEL_HOME (one clone per machine)"]
    direction TB
    MEM["memory/<br/>global/ committed<br/>repos/&lt;name&gt;/ gitignored<br/>personal/ gitignored"]
    INDEX[("index.json<br/>flat cards + by_tag / by_term / by_scope")]
    CFG["config.local.yaml<br/>roots · agents · triage · hooks"]
    DLOG[("decisions.jsonl<br/>append-only triage log")]

    IDX["ai-kernel-index<br/>tier 0"]
    TRI{{"ai-kernel-triage<br/>THE DECIDER<br/>task.json → decision.json"}}
    AGT["ai-kernel-agent<br/>engine swap-point"]
    SGT["ai-kernel-suggest<br/>UserPromptSubmit hook"]
    SCN["ai-kernel-scan<br/>shadow-source deviation"]
    BRN["ai-kernel-burn<br/>codeburn wrapper"]
  end

  subgraph TIERS["Tiered backends (config-driven)"]
    direction LR
    T0[tier0 bash]
    T1[tier1 Ollama]
    T2[tier2 Haiku]
    T3[tier3 Sonnet]
    T4[tier4 Opus]
  end

  ENGINE(["claude -p · codex exec · qwen chat<br/>swappable"])
  SHADOW[".serena/memories<br/>.claude/projects/*/memory<br/><i>shadow sources, scanner only</i>"]
  HARNESS["host harness<br/>Claude Code · Cursor · Codex"]

  MEM --> IDX --> INDEX
  CFG -.reads.-> IDX & TRI & AGT & SGT & SCN

  HARNESS -- "UserPromptSubmit hook<br/>(prompt as query)" --> SGT
  SGT -- "task.json" --> TRI
  SCN -- "task.json" --> TRI
  SHADOW --> SCN

  INDEX --> TRI
  INDEX --> SGT

  TRI -- "decision.json" --> AGT
  TRI -- "append" --> DLOG
  TRI -- "surface_cards (system-reminder)" --> HARNESS

  AGT --> T0 & T1 & T2 & T3 & T4
  T2 --> ENGINE
  T3 --> ENGINE
  T4 --> ENGINE

  DLOG --> BRN

  classDef mem fill:#3fb95022,stroke:#3fb950,color:#e6edf3
  classDef cfg fill:#d2991d22,stroke:#e3b341,color:#e6edf3
  classDef tri fill:#a371f722,stroke:#a371f7,color:#e6edf3,stroke-width:3px
  classDef agt fill:#db61a222,stroke:#db61a2,color:#e6edf3
  classDef script fill:#161b22,stroke:#6e7681,color:#e6edf3
  classDef tier fill:#161b22,stroke:#484f58,color:#8b949e
  classDef engine fill:#1f6feb22,stroke:#1f6feb,color:#e6edf3
  classDef shadow fill:#6e768122,stroke:#8b949e,color:#8b949e,stroke-dasharray:4 3

  class MEM,INDEX,DLOG mem
  class CFG cfg
  class TRI tri
  class AGT agt
  class IDX,SGT,SCN,BRN script
  class T0,T1,T2,T3,T4 tier
  class ENGINE engine
  class SHADOW,HARNESS shadow
```

## 2. Request flow — how a query moves

```mermaid
sequenceDiagram
  autonumber
  participant H as Host harness<br/>(CC / Cursor / Codex)
  participant S as ai-kernel-suggest
  participant T as ai-kernel-triage
  participant I as index.json
  participant A as ai-kernel-agent
  participant M as Model<br/>(Haiku / Sonnet / Opus / Ollama)
  participant L as decisions.jsonl

  H->>S: UserPromptSubmit hook<br/>(prompt JSON + $PWD)
  S->>S: scope = [global, repos/basename($PWD)]
  S->>T: task.json {kind, query, scope}
  T->>I: lookup by_tag / by_term / by_scope
  I-->>T: candidate card ids
  T->>T: case-statement → tier + cards
  T->>L: append decision
  T-->>S: decision.json {tier, surface_cards, action}
  alt action = nudge
    S-->>H: system-reminder with surface_cards
  else action = dispatch
    T->>A: decision.json
    A->>A: read agents.tier_N.cmd
    A->>M: shell out (claude -p / qwen / …)
    M-->>A: response
    A-->>H: result
  else action = skip
    S-->>H: (silent)
  end
```

## 3. Deployment topology — C-global

```mermaid
flowchart LR
  subgraph MACHINE["developer machine"]
    direction TB

    subgraph KH["$AI_KERNEL_HOME (~/Projects/ai-kernel)"]
      direction TB
      KMEM["memory/{global,repos/*,personal}"]
      KBIN["bin/ai-kernel-*"]
      KCFG["config.local.yaml"]
    end

    subgraph CC["~/.claude/settings.json"]
      HOOKS["UserPromptSubmit<br/>→ $AI_KERNEL_HOME/bin/ai-kernel-suggest --cc-prompt-hook"]
      ENVV["env: AI_KERNEL_HOME=…"]
    end

    subgraph REPOS["host repos (no kernel install)"]
      direction LR
      R1["~/Projects/elmo-application"]
      R2["~/Projects/platform-common"]
      R3["~/Projects/anything-else"]
    end

    HARNESS["agent session<br/>(spawned per repo)"]
  end

  subgraph CLOUD["remote"]
    GIT["github.com/siunegu/ai-kernel<br/>committed: memory/global only"]
    ANTH["Anthropic API"]
    OLL["localhost Ollama"]
  end

  R1 -.spawns.-> HARNESS
  R2 -.spawns.-> HARNESS
  R3 -.spawns.-> HARNESS

  HARNESS -- reads --> CC
  CC -- invokes --> KBIN
  KBIN -- reads --> KMEM
  KBIN -- reads --> KCFG

  KH <-. git push/pull memory/global .-> GIT
  KBIN -- tier 2-4 --> ANTH
  KBIN -- tier 1 --> OLL

  classDef cloud fill:#1f6feb22,stroke:#58a6ff,color:#e6edf3
  classDef kernel fill:#3fb95022,stroke:#3fb950,color:#e6edf3
  classDef harness fill:#a371f722,stroke:#a371f7,color:#e6edf3
  classDef repo fill:#161b22,stroke:#6e7681,color:#c9d1d9
  classDef settings fill:#d2991d22,stroke:#e3b341,color:#e6edf3

  class GIT,ANTH,OLL cloud
  class KMEM,KBIN,KCFG kernel
  class HARNESS harness
  class R1,R2,R3 repo
  class HOOKS,ENVV settings
```

## Key invariants

- **One kernel clone per machine.** No per-repo install. Host repos are untouched.
- **Memory is plain markdown + YAML.** Any agent can `cat memory/*.md` without the kernel.
- **The index is derived.** Delete `index.json` and `ai-kernel-index` rebuilds it.
- **Triage is the only decider.** It chooses tier, cards, and action — and may never spend more than `max_self_spend` on its own decision.
- **Engine is config-driven.** `agents.tier_N.cmd` swap = zero code change.
- **Scope-default for surfacing:** `[global, repos/basename($PWD)]`. `personal/` is opt-in.
