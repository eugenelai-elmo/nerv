
## Payslips — Mobile Feature Initiative

**PM:** Maulik Desai (ELMO Mobile App). **Program Director:** Anupam Kaushal
**UX:** Greg Creighton (canvas owner, iteration 10)
**Sync organiser:** Zeynep Canli (recurring Tuesdays)
**Teams:** Mobile squad + Payroll Integrations (backend)
**Funding:** CTO go-faster paper — two contract engineers, six months

### Engineering Team (as of 20 Aug 2026)

**Driving design:**
- **Charith Hewage** — lead (created epic HPI-1788, driving architecture + design)
- **Allan Dy** — dev (co-authoring design docs)

**Reviewing (informed + approved):**
- **Sam Lafte**
- **Carlos Resultay**
- **Olalekan (Ola)** — senior mobile engineer, reviewer (added to channel 20 Aug)
- **Hai Le** — senior mobile engineer, reviewer (added to channel 20 Aug)
- **Eugene Lai** — mobile TL, not doing the build; setting up cadence + overseeing

**Cadence:** Weekly engineering sync (Eugene setting up). Ad-hoc as needed.
**Slack:** #elmohr-payslips-mobile
**Process communicated (20 Aug):** Lock tech design → work breakdown → map against timelines. Charith + Allan drive, everyone else reviews. Eugene scheduling additional catch-ups in coming weeks.

### Key Links

| What | Link |
|------|------|
| Slack | [#payslips](https://grid-elmo.enterprise.slack.com/archives/C0BRFVDDS3S) |
| PRD (canonical) | [Payslips in the ELMO Mobile App — MicroPay and KeyPay](https://elmolearning.atlassian.net/wiki/spaces/LMA1/pages/4867294075) |
| Delivery plan | [Artifact](https://claude.ai/code/artifact/51b21e33-b1c9-45e4-801c-a2868c9f6aa1) (shared by Maulik) |
| Backend PRD | [Artifact](https://claude.ai/code/artifact/58470006-21ad-4c1e-8c6b-ee1c32831424) (HPI-1562, access restricted) |
| UX canvas | [Payslip & Leave Management UX](https://elmolearning.atlassian.net/wiki/display/RNDHB/Payslip+%26+Leave+Management+UX) |
| Competitive deep-dive | [D4b — UKG & Humanforce extension](https://elmolearning.atlassian.net/wiki/display/RNDHB/D4b+%E2%80%94+Payslip+%26+Leave+Mechanics%3A+UKG+%26+Humanforce+extension+%28A5+%C2%B7+A6+%C2%B7+A7+%C2%B7+A3%29+-+26-08-06) |
| Discovery spike (Mar 2026) | [Pay Slips in Mobile App](https://elmolearning.atlassian.net/wiki/display/EI/Discovery%3A+Pay+Slips+in+Mobile+App) (~50 story points) |
| Leave mastership | [D6 — Current State, Leave Mastership & Sync Mapping](https://elmolearning.atlassian.net/wiki/display/RNDHB/D6+%E2%80%94+Current+State%2C+Leave+Mastership+%26+Sync+Mapping+%28A4+%C2%B7+A5+%C2%B7+A9%29+-+26-08-06) |
| MicroPay/KeyPay comparison | [Technical Questions, Risks & Comparison](https://elmolearning.atlassian.net/wiki/display/EI/Copy+of+Micropay+Integration+%E2%80%94+Technical+Questions%2C+Risks+%26+KeyPay+Comparison) |
| Hub page (empty) | [ELMO - Payslips](https://elmolearning.atlassian.net/wiki/spaces/LMA1/pages/4867326797) |
| Jira epic | HPI-1788 (Pay Documents API — all work tracked here) |
| Design docs PR | HPI-1788 docs-only PR (Charith + Allan, source files in PR) |
| Backend PRD ticket | HPI-1562 |
| Kickoff | 17 Aug 2026 |

### Strategic Context

- $3.84m FY26 closed lost due to two-app experience
- "Payslips are the #1 reason staff log into ELMO"
- Competitors (Employment Hero, Roubler, Humanforce, UKG, Deputy) all have in-app payslips — this is catch-up
- Enables Rotageek AU launch ($2.50m FY26 closed lost parked pending three-product employee experience)
- FY27 "Complete AI Workforce Platform" strategy, coverage pillar

### Timeline (Aug–Dec 2026)

| Phase | Dates | What |
|-------|-------|------|
| 1 — API dev | 17 Aug – 9 Oct | Two contractors build payslip APIs in Payroll Integrations squad |
| 2 — Mobile FE | 12 Oct – 20 Nov | Contractors migrate to Mobile squad, build app screens P1–P4 |
| Store submission | 18 Nov | Five weeks buffer before Apple review freeze (~23 Dec) |
| Payslips live | End Nov | |
| 3 — Leave | 23 Nov – 18 Dec | KeyPay leave types first (extend proxy), then MicroPay leave (from-scratch engine) |

### Architecture — "Leave Proxy Pattern" + Document Envelope

**20 Aug update:** Charith + Allan created a design docs PR introducing a **shared document envelope** at `src/shared/document`. This decouples the document handling layer from core modules and adds a security layer. Initial draft — they'll iterate. Docs-first approach to keep both devs aligned and fast-track development.



App never calls vendor APIs directly. Two backend engines behind a unified proxy:

- **Dev A → MicroPay (Sage)** integration: payslip list, PDF passthrough, polling. MicroPay Web API is per-tenant (purchased+provisioned via Access consultant). No pay-run-finalised event — document-ready detection by polling.
- **Dev B → KeyPay AU ESS** integration: payslip list, document download, portal access. Portal access required (bidirectional sync grants it on employee creation).
- **Contract frozen 28 Aug** — both engines callable on staging by 25 Sep
- Delivery order: MicroPay first → KeyPay AU → KeyPay NZ (deferred to Jan)
- Web payslip experience uses the same API but specced/tracked separately

### Mobile Stories (Phase 2)

- **P1** — Tab navigation
- **P2** — PDF viewing
- **P3** — Push notifications
- **P4** — Privacy re-authentication

### Blocking Dependencies (7 items)

1. Contractor start date confirmation
2. Auth/identity decision (Open Question 7)
3. MicroPay Web API tenant enablement answer
4. Hi-fi design completion before 12 Oct
5. Tab bar sign-off
6. Privacy re-authentication decision (needed by end Oct)
7. Leave PRDs publication and KeyPay scope agreement

### Out of Scope

- Leave management (own PRD)
- Manager approvals (own PRD)
- Web payslip experience (same API, separate spec)
- Other payroll engines (PayRTA, Affinity, Datacom, Definitiv)
- Structured pay data in ELMO (unit is the document)
- Payslip search/filtering (reverse-chronological list only)

### Past Incidents

- **MAYDAY-399** (Nov 2024): HRC-704 code cleanup broke Sage/CSV payslip viewing. Zaw Htut fixed, 3hr resolution.
- **KeyPay bug** (Jan 2025): KeyPay codebase bug caused underpayment/overpayment/incorrect payslips for 19 ANZ customers. SEV-0 for tracking.

### Progress (as of 1 Sep 2026)

**Done:**
- ~~Charith to share architecture + designs~~ — DONE (design docs PR, HPI-1788)
- ~~Communicate RACI to channel~~ — DONE (20 Aug)
- ~~Add Hai + Ola to channel~~ — DONE
- ~~Weekly engineering sync~~ — DONE (Mondays, running since 24 Aug)
- ~~Tech design review~~ — DONE (28 Aug, Charith/Allan/Carlos attended)
- ~~API contract frozen~~ — DONE (28 Aug)
- ~~KeyPay spike (HPI-1789)~~ — DONE (Allan, viable path found)
- ~~BFF overview~~ — Descoped (ADR-013)
- Design Q&A decisions (26 Aug): net amount approved by compliance, From/To filtering, payment summaries not needed AU (STP)

**Current blockers (none on Eugene's team):**
- ADR-007 (net vs gross field naming) — blocks A5. On: Maulik + Charith
- HPI-1806 (OAuth2 scope registration) — not started, cross-repo TMS. On: Charith
- OQ1 (privacy re-auth) — by end Oct. On: Maulik + Legal
- OQ3 (MicroPay tenant enablement) — commercial step. On: Maulik/Anupam

**Next gate:** Both engines on staging 25 Sep

**Emerged since plan was written:**
- Zeynep Canli now driving design (hi-fi mocks HPI-1830 In Dev, edge cases HPI-1835 In Dev)
- Anupam exploring payroll domain MCP — convergence forcing function for D6 two-paths finding
- Design Q&A page on Confluence tracking design decisions

### Artifacts

| What | Link |
|------|------|
| Engineering Hub | [Artifact](https://claude.ai/code/artifact/f7b18135-26e8-4793-abbb-dfcd15e44b15) — architecture, gates, milestones, weekly sync checklist |
| Briefing | [Artifact](https://claude.ai/code/artifact/33cdc40a-e7a8-4774-b21c-ee9ef559cc2f) — initiative overview |
| IdP Migration | [Artifact](https://claude.ai/code/artifact/eee2ea3d-14c0-4a2c-9815-9da62de122ee) — auth stack explainer |
| Delivery Plan | [Artifact](https://claude.ai/code/artifact/51b21e33-b1c9-45e4-801c-a2868c9f6aa1) — Maulik's product timeline (still active) |
| Design Q&A | [Confluence](https://elmolearning.atlassian.net/wiki/spaces/FF/pages/4866540225) — Zeynep's running decisions log |

### Weekly Sync Protocol

Baked into the engineering hub artifact. Pre-sync: check gates, blockers, handover readiness, cross-team deps, mobile epic shape. Post-sync: update the artifact.

**Why:** Eugene manages the mobile team; this is a major mobile feature shipping Q4 2026 with contractor dependency and vendor integration complexity.

**How to apply:** Track dependencies and timeline pressure. Phase 1 API work is the critical path — if contractors slip, mobile FE (Phase 2) and store submission compress. Related to [[mobile-mf-session-outcomes]] since mobile app architecture decisions affect how payslips integrates.
