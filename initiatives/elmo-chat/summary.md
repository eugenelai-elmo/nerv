## Architecture (revised 27 Aug 2026, pending guild decision)

```
ELMO Chat (all users)                  Intercom Fin widget (admins only)
Chat Panel → Kong → BFF ──→ AG /v1/chat/... (Bedrock)   Support-owned, separate window
(menu-next)          │  └──→ AG /mcp → Domain MCPs       Chris designing coexistence UX
                     │
                     ├→ Redis (sessions, conversation state)
                     └→ Feedback (MVP: S3, target: Langfuse OTEL)

Langfuse: native OTEL from agentgateway (config-only) — collection from onset
```

**Two services (Option A, recommended). Pending architecture guild.**
- **BFF** (NestJS, ~1,500 lines): agent loop (LLM ↔ tools), reads `X-Kong-JWT` (Kong-signed RS256 superset) → tenant context → system prompt, SSE streaming, conversation persistence, feedback collection. Forwards JWT as Bearer to AG.
- **agentgateway** (Rust, open-source, config-only): LLM proxy (Bedrock, IRSA, HA, retries), Virtual MCP (federates domain MCPs), CEL (thin: `enabledModules` gating, coarse role visibility — real auth is in MCPs), per-tenant metering (virtual keys), OTEL → Langfuse.
- **Domain MCPs** (self-contained): field projection + tenant data scoping via TMS API permissions. Each MCP handles its own permissions — no middleware needed.
- **Orchestrator: dissolved.** AG absorbed routing + thin CEL gating. BFF absorbed agent loop. Domain MCPs always handled data scoping + field projection. DP's "differentiating capabilities" (field projection, tenant gating) are actually in MCPs (TMS API perms) and Kong JWT — Orchestrator centralises but doesn't uniquely provide them.

**AG current state (27 Aug Glean discovery):**
- Live on elmo-shared as Platform MCP proxy (K8s, ES, SonarQube, Jenkins, Backstage). VPN-only, ~20 engineers.
- 2 replicas across AZs, 100m CPU / 128Mi each, no HPA. Never customer-facing.
- LLM proxy to Bedrock configured (INF-5816). CEL auth validated.
- DP's Confluence doc (28 Jul) argues Orchestrator 44.5 vs AG 41.5 — but his "differentiating" capabilities are distributed to other layers.
- **Promoting AG to customer-facing requires:** HPA, load testing, incident runbook, on-call, security review. Both AG and Orchestrator need prod hardening; AG starts from a stronger base (Rust, already running, infra team owns it).

**Guild decision brief (topology artifact):**
- Three options: A (Config-governed: BFF+AG), B (Code-governed: BFF+Orchestrator), C (Layered: BFF+AG+Orchestrator)
- We recommend A. Build-vs-buy: open-source Rust proxy (config YAML, community maintained) vs custom NestJS in the hot path (custom code, team-maintained, slower runtime).
- Counterargument bar: name a specific capability CEL + MCPs can't handle. Centralisation alone isn't enough.
- Graduation trigger: if CEL can't express a future auth need, reintroduce Orchestrator. Code preserved.
- **Topology artifact:** https://claude.ai/code/artifact/d919675f-0de4-4e2c-b616-f534f10c3888

**Kong rate limiting (platform gap, not chat-specific):**
- MAYDAY-542 (LAB-803, 4 Aug) mitigations still To Do. Kong rate limiting on auth endpoints flagged in Dennis's prod readiness doc as missing.
- Specific routes have rate limiting (M2M token: 30/min/IP, MCP routes: 60/min/tenant). Broad platform routes do not.
- BFF httpRoute needs rate limiting from day one. Not a blocker for guild decision but a prod readiness dependency.
- Abuse is identifiable (JWT = user + tenant in every request → APM traces → ban at TMS level).

**Josh 25 Aug decisions:**
1. **Fin is NOT our integration.** Support owns Fin entirely. Fin widget for admins only. ELMO MCP Chat for all users. Two separate windows.
2. **Our boundary:** chat interface + feedback collection. MCP response quality = domain teams' problem.
3. **M2 dropped.** Avoid entangling with Fin/support. Timeline: M1 → M2 (was M3) → M3 (was M4).
4. **Architecture guild** decides agentgateway vs orchestrator. Josh directed: "don't make a unilateral decision without Aaron and Dave in the room."
5. **Pendo Resource Centre:** we own it, authorized to remove.
6. **Feedback from onset.** Collection yes (S3 MVP, Langfuse target). Analysis pipeline = M3+. Eugene + Aaron decide implementation.
7. **Josh taking overall ownership structure.** "That's my problem, let me sort that out."
8. **MCP quality bar:** Maulik takes "what good looks like" to product group. Product defines, domain teams implement.

**Auth pattern:**
- Kong `oidc-multitenant` plugin. BFF reads `X-Kong-JWT` (Kong-signed RS256 superset JWT, minted every request). Passes as Bearer to agentgateway. AG validates independently. CEL gates tool visibility (coarse: `enabledModules`, role). Fine-grained auth is in the MCPs (TMS API permissions).
- Two JWTs on every Kong-proxied request: `X-Kong-JWT` (Kong-signed superset) and `X-ELMO-JWT` (TMS id_token passthrough). BFF uses `X-Kong-JWT`.
- `X-User-*` convenience headers: for simple services that don't parse JWT (recruitment-api, performance, capability-forecast). BFF doesn't use them — we need the full JWT to forward to AG. `X-User-Permissions` is dead (HOR-115).
- Token exchange (JWT ↔ TMS PHPSESSID): platform concern (PLA-6047 Keycloak migration). BFF doesn't do token exchange.
- **All pages (SPA + legacy):** chat deployed via menu-next. Fail-open self-recovery (same as recruitment + capability-forecast):
  - On mount: probe `/kong/oauth2-client/anon/jwt`. If no Kong session → `fetch(/kong/session/init)` follows the full OIDC redirect chain in the background (Kong → TMS auto-grant → Kong callback → Set-Cookie). NOT `prompt=none` / iframe — it's a same-origin fetch piggybacking on the still-alive TMS PHP session.
  - Retry budget: `MAX_KONG_SESSION_REFRESH_ATTEMPTS = 2` within `30s` window (`libs/authentication/src/constants.ts`). Shared across mount probe + mid-session 401 recovery. Deduplicated (one in-flight OIDC round-trip at a time, ID-129 fix). QueryClient never retries 401s.
  - On exhaustion: chat panel fails open (doesn't render). Never redirects to login. Never loops. Render deadline timeout prevents hung Kong from blanking the shell.
- **Security note:** Kong MUST strip incoming `X-User-*` / `X-ELMO-*` headers to prevent spoofing. Flagged as possibly incomplete (PLA-6093).

**MCP interaction rules:**
- Not architecture — product guidelines. Defined in Maulik's MCP authoring guide (flag sheet).
- Three layers of instruction: system prompt (BFF config), tool definitions (MCP schema), tool responses (MCP data).
- LLM decides based on what tools return. MCP returns deep links for complex tasks. Chat panel renders both in-chat results and redirects.
- MVP: read-only queries + single-turn actions. Multi-turn slot-filling = later. Complex workflows = redirect to screen.

## Competitive Intel: Rippling AI (27 Aug teardown)

**Artifact:** https://claude.ai/code/artifact/523e671b-e2ba-477c-9fd8-43a2c72f5f25
**Source:** Rippling /platform/ai hero video (6:52), frame-by-frame analysis + Carl's MCP Launchpad page overlay.

**Key finding:** Same architectural pattern (agent loop federating domain data via tool calls). Their "Business Data Graph" = our Virtual MCP. Gap is data coverage, not architecture.

**Rippling's advantage:** Unified schema (HR+Payroll+Time+IT+Finance). Their headlines (overtime root cause, paycheck investigation, promotion×retention) are text-to-SQL against one schema. We can't replicate without a unified analytics layer — and don't need to for M1-M3.

**Why it doesn't apply to us yet:**
- Rippling demos target HR leadership (narrow persona, cross-org data). ELMO Chat goes to ALL users — most queries are single-domain, permission-scoped, my-data-or-my-team.
- Our data model (TMS silos, PHP monolith partially decomposed, Debezium/Kafka CDC early) can't support text-to-SQL.
- The cross-domain analytics persona already has ThoughtSpot.

**ELMO domain readiness (from Carl's Confluence page):** 3 READY (HR Core, Recruitment, HR Lab), 1 SPEC GAP (HR Core writes), 3 NEEDS API WORK (Rem, Onboarding, Docs), 4 NOT ASSESSED (Payroll, Learning, Perf, Survey). Payroll gap is concerning — central to 3/10 Rippling scenarios.

## Complexity Progression (27 Aug design session)

| Phase | Pattern | Example | Mechanism |
|-------|---------|---------|-----------|
| M1 | Single-domain read | "What's my leave balance" | 1 MCP call |
| M2 | Single write + confirm | "Enrol Jane in training" | 1 MCP call + confirmation gate |
| M2 | Two-domain chained read | "Who on my team hasn't done training" | 2 sequential MCP calls (BFF agent loop) |
| Post-M2 | Bulk by criteria + confirm | "Enrol everyone in Sydney who hasn't" | N MCP calls via agent loop + confirm |
| Screen-only | Bulk by list | Paste 300 names | Existing bulk import tools |
| Future | Cross-domain aggregation | "Avg time-to-hire by dept" | Text-to-SQL / analytics layer |

**Design principles confirmed this session:**
1. **Chat finds, chat confirms, chat does simple writes — doesn't orchestrate multi-service transactions.** Same as Salesforce, Workday, ServiceNow, Microsoft. For multi-domain writes, chat prepares + hands off.
2. **Bulk by criteria, not by list** (Maulik to Josh, confirmed). Attachments out of MVP. "Enrol everyone in Sydney" works in chat; pasting 300 names doesn't. Bulk by criteria is post-M2 fast-follow, not never.
3. **System prompt guardrails:** Agent knows tool inventory, redirects analytics/cross-domain queries to ThoughtSpot with deep links. Not a hard rejection — a redirect.
4. **MCP tool design:** Accept arrays not just individual IDs. Maulik's authoring guide should specify.
5. **Multi-domain writes unsolved.** "Promote Jane + update training" spans 2 MCPs. Step 1 commits, step 2 fails → partial success, no rollback. Industry pattern: delegate multi-step writes to workflow engine. **Guild question: what's our handoff target?**

**Cost control (all users prompting Bedrock):**
- agentgateway virtual keys: per-tenant metering + rate limits (RPM/TPM)
- Token budgets: per-tenant ceiling. Product decision: per-tenant? Per-user? Plan add-on?
- Cost attribution: virtual keys (per-tenant) + Langfuse OTEL (per-conversation)

## Current State (14 Sep 2026)

**14 Sep meeting (Josh, Maulik, DP, Allan, Eugene, Anu, Nick):**
- Josh: hard deadline Oct 1 for MCP Blitz. If AG auth isn't solved, Orchestrator ships by default.
- K1 board wants MCP read/write NOW.
- Chat API ownership: asked DP if his team will own the build (productionise his POC). Awaiting answer.
- FE owns the FE↔BE contract. DP owns architecture and must approve.
- If DP's team takes the Chat API build, Eugene's web team is free — only owns chat panel + contract.

**14 Sep follow-up (Eugene → Josh, 1:1):**
- Highlighted Chat API ownership gap. Josh reiterated: "pretty clear it's DP's team's remit."
- **Escalation path:** If no reply from Nick Shelswell (DP's EM) by COB 14 Sep → Eugene books 20-min alignment meeting with all stakeholders (Allan Crain, Josh, Ning Ning, Maulik, DP, Nick, Anupam) to resolve ownership.

**Chat API repo situation:**
- `elmo-chat-service` (GitHub) — gutted to a shell (1 file). Deliberately stripped to rebuild clean. This is the target repo.
- `elmo-ai-chat-assistant` (Bitbucket) — DP's full POC. Hono monorepo, 12k lines. Reference only — group agreed NOT to deploy POC as-is. Chat API must be built properly in `elmo-chat-service`.
- **This is the critical path.** Someone needs to build the Chat API in `elmo-chat-service` for October. Ownership pending DP's answer.

**Frontend:**
- PR #52 approved (Jayz) — drawer shell + nav integration + flag gating + BaseDrawer EDS additions
- ESL-4164 created — menu-ext integration (legacy TMS pages), follow-up
- ESL-4148 epic (6 stories, 10 points) — stories 1 (drawer shell) nearly done

**Infrastructure:**
- agentgateway live on staging (LLM proxy + Virtual MCP + Langfuse OTEL)
- HR Core MCP live on staging (3 tools, proven with Claude Desktop + Glean)

**October Blitz checklist — 5 gaps to close:**

| # | Gap | Owner | Status |
|---|-----|-------|--------|
| 1 | Chat panel merged + deployed to staging | Jayz | PR #52 approved, needs merge + deploy |
| 2 | Chat API built + deployed to staging with Kong route | DP (pending) | Must be built in `elmo-chat-service` — POC deploy rejected. Critical path. |
| 3 | ChatApiProvider in chat panel | Jayz | Wire real endpoint — small task once #2 exists |
| 4 | menu-ext integration (ESL-4164) | Jayz | Legacy TMS pages get Ask ELMO |
| 5 | frontendElmoChat flag in LaunchDarkly | Anyone | Create in LD dashboard, on for staging |

**Project hub:** https://claude.ai/code/artifact/981d8bf5-9183-40d3-851a-f450fba90ec1
**Topology brief:** https://claude.ai/code/artifact/d919675f-0de4-4e2c-b616-f534f10c3888
**DP's ADR:** https://claude.ai/code/artifact/6f646e6d-ec4c-4b68-b9e9-abbc866a0aba
**DP's MCP tracker:** https://claude.ai/code/artifact/229616cd-a523-4633-822f-dfd0d10f509a

## Milestones (revised 14 Sep)

| Milestone | When | Scope |
|-----------|------|-------|
| Oct Blitz | 1 Oct | Chat panel on staging + Chat API on staging = e2e demo. Domain teams start MCP onboarding. |
| M2 | Oct-Nov | Domain teams build MCPs, integrate + test, quality gate. Chat API hardened (Q2 if DP takes build). |
| M3 | Dec | Canary rollout (curated tools only), analytics baseline |

CTO dates: Dec = testing env, Mar 2027 = full live, Sep 2027 = Kore.ai off.
Josh 14 Sep: If AG auth isn't solved by Oct, Orchestrator ships. K1 board wants MCP now.

## Blockers / Open

- **Chat API ownership** — asked DP if his team takes the build. Awaiting answer. Determines Q2 planning.
- **Chat API on staging** — nothing deployable in `elmo-chat-service` (gutted). DP's POC (`elmo-ai-chat-assistant`) is the only working backend. Needs deploying + Kong route for Oct blitz.
- **Auth story** — AG over Orchestrator contingent. Dave Newson's court. If not solved by Oct, Orchestrator wins by default.
- **Keycloak** — affects external MCP path only (Claude Desktop, Glean). Chat path through Kong unaffected.
- **menu-ext integration** (ESL-4164) — legacy TMS pages need Ask ELMO. Separate from SPA path.
- **frontendElmoChat flag** — needs creating in LaunchDarkly dashboard.

## People

- **Josh McKenzie** — CTO, sponsor. Hard deadline Oct 1. K1 board pressure.
- **Maulik Desai** — PRD owner, system prompt suite, eval playbook, quality bar
- **DP** — MKT INT TL, POC author (`elmo-ai-chat-assistant`), domain MCPs. Owns architecture approval. Ownership of Chat API build: pending.
- **Allan Crain** — Chat API architecture input, load testing
- **Jayz** — Chat panel frontend (PR #52), ChatApiProvider wiring
- **Aaron Pejakovic** — Infra, agentgateway, staging env
- **Eugene Lai** — Chat panel oversight, FE↔BE contract, architecture shepherd
- **Dave Newson** — Auth story gatekeeper (AG vs Orchestrator decision depends on him)

## Links

- [Project hub (one-pager)](https://claude.ai/code/artifact/981d8bf5-9183-40d3-851a-f450fba90ec1) — canonical, includes guild options
- [Chat UI Design (Chris)](https://claude.ai/code/artifact/a3cb8d94-2971-48a2-9bdb-592e76998015)
- [MCP Authoring Guide (Maulik)](https://claude.ai/code/artifact/eb003826-832c-47f0-94bc-946cfa41dbb3)
- [DP's Orchestration Decision Brief (Jun '26)](https://elmolearning.atlassian.net/wiki/spaces/SA/pages/4849270842)
- [Kong Auth Architecture](https://elmolearning.atlassian.net/wiki/spaces/SA/pages/4805068068) — Dennis's doc on X-Kong-JWT + X-ELMO-JWT + X-User-*
- [Keycloak Migration (PLA-6047)](https://elmolearning.atlassian.net/wiki/spaces/DS/pages/4844815506) — Ning Ning's identity modernisation
- [agentgateway docs](https://agentgateway.dev/docs) — CEL, Virtual MCP, JWT policies
- Build spec: `elmo-chat-service/docs/bff-rewrite-spec.md`
- Topology: `.ai/initiatives/elmo-chat/topology.excalidraw`
- Langfuse eval: `memory/reference_langfuse_eval.md`
- [Rippling AI teardown](https://claude.ai/code/artifact/523e671b-e2ba-477c-9fd8-43a2c72f5f25) — competitive, mapped to ELMO domains
- [MCP Launchpad Use Cases (Carl)](https://elmolearning.atlassian.net/wiki/spaces/PM/pages/4867653677) — product-domain use cases + API readiness
