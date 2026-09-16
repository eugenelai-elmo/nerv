
Architecture session led by Ola Akintola (senior eng, feature lead on mobile MF). Eugene is TL.

**Target:** Q2 FY27 PRODUCT READY — Mobile APP consolidation (ELMO > RG) per Big Rocks.

## Current State (15 Sep 2026)

Discovery closed. Decisions locked with flasum. Zephyr DACI through arch guild (LMS-1248 Closed).
Josh meeting 14 Sep: conditional green light for Zephyr. Theming also green-lit.

### Zephyr — CONDITIONALLY APPROVED (14 Sep)
Josh's conditions (all must be met before signing up):
1. **Ramesh security review** — written report confirming safe to proceed
2. **UK team (flasum) written confirmation** — onboard with the approach, all integration points agreed
3. **If 1 + 2 pass → Ning Ning signs up month-to-month** (credit card, Team plan ~$65-95/mo)
4. **Revisit annual pricing** once proven and team is happy with it
Confluence is the right place for the written confirmations (system of record, linkable, versionable).

### Auth — DECIDED: Refresh token handoff
- Pass ELMO refresh token to Frontdoor. No new ELMO backend endpoint needed.
- UK team owns all Frontdoor/identity changes (flasum confirmed 24 Aug). Planned into Q2.
- No internal arch guild approval needed — no ELMO backend work.
- Ola spiking (LMS-1266): try existing Frontdoor endpoint in PoC, document outcome.
- Ola committed to sharing auth v2 design doc with flasum before next call.

### Notifications — DECIDED: Extend Platform enum (not Knock)
- Extend existing `registerDevicePushNotifications` mutation with `ELMO_IOS` / `ELMO_ANDROID`.
- Mutation: `src/services/graphql/remote/mutations/registerDevicePushNotifications.graphql`
- Input: `{ mobilePlatform: Platform!, token: String! }`. Trivial backend change.
- UK team or Anupam/Naveed builds once scope clear.
- Hai evaluating two options (LMS-1247): flasum's dual-hub (Opt 1) vs TMS middle layer routing to Knock (Opt 2).
  - Opt 1 drawbacks: user must open app first, no central preference control, push token timing gap, client-side feed merging.
  - Opt 2 cleaner architecture but requires TMS endpoint (Platform team) + RG Notifier routing change.
  - Combined feed required — one chronological list, not separate RG section.
- flasum confirmed 25 Aug call: UK team ownership of notification backend work.

### Zephyr — CONDITIONALLY APPROVED (see above)
- Ola's DACI rewritten (LMA1/4880564240, 3-4 Sep). Previous version: LMA1/4873487923. LMS-1248 Closed.
- DACI through arch guild (submission 7 Sep, review 9 Sep).
- DACI clarifies: Zephyr sits on the deploy path, not the user's path. Under BYOC, device fetches from ELMO-owned CloudFront/S3. Control plane down = promotion pauses, installed apps keep loading current stable URL.
- Lambda@Edge question: ELMO web already has Lambda@Edge in front of every CloudFront request — not a new surface. Whether Zephyr's BYOC Lambda@Edge phones home per-request vs deploy-time still needs confirmation from Zephyr.
- **Next:** Ramesh security review + flasum written confirmation → Ning Ning month-to-month signup → prove value → revisit annual.

### Feature flags / localisation — DECIDED: Use existing RG mechanism
- RG's built-in flags + permissions. Client Services enables per-customer.
- ELMO keeps LaunchDarkly for ELMO features. No cross-pollination.
- No boot-time manifest. Operational oversight for market gating.

### Observability — DECIDED: Continue RG stack, add tags
- Raygun + Firebase Analytics continue. Add metadata tags for ELMO vs standalone.
- Intercom OFF day one. No ELMO mobile observability yet (Elastic lacks RN SDK).

### Theming — GREEN LIT (14 Sep)
- Approved. Needs Ramesh's input still.
- Ralph working on public theming API extension. flasum acknowledged AUSMOB-14.

### Versioning — AGREED IN PRINCIPLE
- Pin to major (v12, v13): auto-minor bug fixes, manual for RN upgrades.
- Proposals to be developed. UK team needs bundle change visibility.

## Flasum Session #3 (25 Aug 2026)
- Ola drove the call (Eugene absent, deliberate delegation). Hai absent.
- Auth: UK team ownership confirmed again. Ola to submit proposal before next call.
- Notifications: Ola covered for Hai. Two options being evaluated, proposal coming.
- Theming: flasum acknowledged, timeline in 1-2 days.
- No concerns raised. Clean session, <6 minutes.

## Jira Tickets
- LMS-1246 — Auth v1 (original PKCE RFC, superseded by LMS-1266)
- LMS-1247 — Push notifications — host-side unknowns (Hai)
- LMS-1248 — Zephyr DACI (Ola, WIP)
- LMS-1249 — Feature flagging + localisation (updated description)
- LMS-1250 — Providers strategy — Raygun tags, Intercom off (updated description)
- LMS-1251 — Ways of working + versioning (updated description)
- LMS-1266 — Auth v2 — refresh token handoff via Frontdoor (Ola)
- Parent epic: LMS-987 (Rotageek / Elmo app merge)

## E2E Test Strategy (agreed 24 Aug)
- **L1 Stitching (ELMO owns):** Module loads, auth handoff, bridge props, navigation, error boundary, kill switch.
- **L2 Mode switches (ELMO owns, RG reviews):** Push token enum, Intercom off, Raygun tags, feed spliced, standalone works without bridge.
- RG's Detox+Cucumber covers their features — we don't re-test.

## Key Artifacts
- Cheat sheet (auth + Zephyr): https://claude.ai/code/artifact/f7dac159-30a7-410f-b8fd-d6cbb0052fee
- Ola's Zephyr DACI: LMA1/4873487923
- Auth Confluence: Frontend/4868079935
- Zephyr Confluence: Frontend/4868014364
- Operating model: https://claude.ai/code/artifact/83700b82-3d01-4456-9f87-d15403845ad3

## Dependencies on UK Team (Q2)
- Frontdoor auth endpoint (flasum confirmed, needs Ola's design doc)
- Platform enum extension on push mutation (flasum confirmed, trivial)
- Theming GQL shape update (AUSMOB-14, timeline coming)

## Risks
- **Zephyr runtime dependency** — if version resolution calls home, it's a production dependency with no SLA on Team plan. Answers pending.
- **Feed merging** — two backends, two formats, one feed. Least understood piece.
- **UK Q2 planning** — flasum said "agree shape, plan into Q2." If auth design doc slips, UK can't plan.
- **Hai's notification approach** — Opt 2 (TMS middle layer) adds Platform team dependency. Who builds the TMS endpoint?

## Related
- [[mobile-mf-arch-review]] — Eugene's 13-area review
- [[mobile-mf-cto-doc-strategy]] — CTO doc strategy (tone-sensitive)
