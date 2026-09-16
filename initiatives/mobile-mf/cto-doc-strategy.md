---

RG vice-CTO (flasum) is antsy and sensitive. The shared Google Doc needs diplomatic framing. Created by Maulik Desai, 2026-07-21.

**Why:** Eugene's 13-area arch review is valid, but dumping it into a shared doc reads as resistance. Filter for collaborative vs internal. The original 13 areas are strong on architecture but light on operations — day-to-day friction of two teams shipping into one binary.

**How to apply:** Use the phased inventory below as the canonical checklist for the mobile MF integration. Reference the share/internal filter when adding to the Google Doc.

## Full Concern Inventory (28 items, phased)

### Phase –1: Prerequisites (before MF work begins)
1. **React/RN version alignment** — converge on React 19 / RN 0.85. ELMO is React 18.3.1 / RN 0.76.3. Weeks of work.
2. **Re.Pack v5 vs Metro MF spike** — Metro MF is experimental, needed patches in PoC. 1-week spike.
3. **Binary size measurement** — build ELMO with RG's required native deps, measure iOS + Android. Set budget with Product.
4. **Native dep classification** — get RG's full list (~21 native deps), classify required / optional / not needed.
5. **App Store review risk** — Apple's stance on runtime-loaded JS bundles. CodePush precedent exists.

### Phase 0: Architecture & Contract
6. **Shared dependencies** — 6 singletons only. CI allowlist, no wildcards.
7. **Bridge contract** — plain JS object, ~8 methods (getAuthToken, getThemeTokens, getUser, navigateToHost, close, on, reportError). One-way host→remote.
8. **Auth handoff** — ELMO provides short-lived token, RG redeems for own session. No shared auth library.
9. **Theming** — bridge exposes design tokens, RG wraps internally. No shared design system package.
10. **Error boundary** — host owns it. Crash = ELMO-styled fallback + log to Elastic with remote version metadata.
11. **Backend API routing** — does RG frontend call RG backend directly or proxy through ELMO? CORS implications.
12. **Navigation model** — full handoff for pilot (bridge.close() returns), container model as stretch.
13. **Compatibility manifest** — remote emits compat metadata at build time, host checks before loading, silent fallback.

### Phase 1: Infrastructure & Delivery
14. **Bundle hosting** — S3 + CloudFront + JSON version manifest. No Zephyr for pilot.
15. **Code signing** — CI signs with private key, host verifies before execution.
16. **Versioning & release coordination** — RG publishes freely, ELMO promotes to manifest after testing.
17. **Hermes bytecode** — PoC delivers plain JS, not compiled bytecode. Users will feel the difference.

### Phase 2: Operations & Observability
18. **Observability** — one pipeline through ELMO's Elastic APM. Source maps per remote version. RG disables Raygun.
19. **Incident ownership & rollback** — ELMO triages, can roll back manifest pointer immediately. RG gets self-serve rollback.
20. **Testing boundary** — three layers: RG unit/integration, ELMO integration against mock remote, contract tests on bridge.

### Phase 3: UX & Integration
21. **Deep linking / push routing** — defer for pilot unless scheduling notifications required. Host owns routing long-term.
22. **Broadcast messages** — how do RG broadcasts reach AU users in ELMO app vs UK users in standalone? flasum raised this.
23. **Third-party SDKs** — Intercom: disable. CodePush: irrelevant. Firebase push: needs routing work. Analytics: no-op stub.
24. **Feature flags** — RG keeps own system for product flags. Bridge provides ELMO-specific flags for market gating.

### Cross-cutting (ongoing)
25. **Cross-team coordination** — async Slack channel + weekly sync. Escalation path.
26. **RG developer experience** — standalone-first dev loop. RG shouldn't need ELMO's app locally.
27. **Data residency** — where does RG scheduling data land for AU users? Needs legal/compliance input.
28. **Memory pressure** — two apps' JS in one Hermes runtime. Measure on lowest-supported Android. Set budget.

## Share with RG (Google Doc — 21 rows)

Frame as "how do we handle X together", not "X is a concern."

Shared items: version gap, shared deps, native deps, auth, bridge contract, theming, error boundary, navigation, deep linking, broadcast messages, feature flags, hosting, versioning, compatibility/fallback, third-party SDKs, observability, incident ownership, backend API routing, testing boundary, cross-team coordination, RG dev experience.

## Keep internal (for now)

- Code signing → reads as "we don't trust your code"
- Kill switch → reads as "we can switch you off"
- Re.Pack v5 spike → internal due diligence
- Estimate pushback (16–20 weeks not 8–10) → internal planning
- Binary size concerns → internal measurement
- Localisation gating → implies their features are a problem
- Memory pressure → internal measurement
- App Store risk → internal research (share if showstopper)
- Data residency → legal/compliance check first, share findings after
- Hermes bytecode → internal perf concern

## Tone rules
- "How do we handle X together" not "X is a concern"
- Lead with what ELMO is providing, not what ELMO requires
- Questions not directives

## Doc & Artifact locations
- Google Doc: https://docs.google.com/document/d/10maV6lxrbiGmOypvrw8Ye4hxnIpXGObdWgj27RYRT4U/edit
- Owner: Maulik Desai
- Google Doc rewrite artifact: https://claude.ai/code/artifact/f523bdd2-b52d-449c-b170-b9c0cf3ef8e0
- Workshop guide artifact: https://claude.ai/code/artifact/3ec7c8f8-0d68-4d00-8daa-a55fa9efa248
- Arch review artifact: https://claude.ai/code/artifact/b8031765-5a5a-4f06-b93c-10ece71b4a1f

## Related
- [[mobile-mf-arch-review]] — full 13-area review (internal reference)
- Radar: mobile-mf-operating-model
