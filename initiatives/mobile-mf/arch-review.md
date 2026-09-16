
Eugene reviewed Ola's LMS-1175 Module Federation Delivery Recommendation (July 2026) for bringing Rotageek into the ELMO mobile app as a federated remote. Nathan Statz also contributed a risk analysis (LMA1 page 4857758103). Eugene posted his 13-area architectural feedback as a Confluence comment on LMS-1175 (comment ID 4857856881, 2026-07-15).

**Why:** Product direction is MF for AU merged-app experience (overrides LMS-906's feature-transfer recommendation). The PoC is real (working Android APK, 71 tests, offline recovery, Zephyr delivery). But the estimate is optimistic and several architectural decisions need tightening.

**How to apply:** These are standing directives for the mobile MF implementation. Reference when reviewing mobile MF work, estimating, or advising the mobile team.

## Key Decisions

1. **Minimal sharing** — only 6 singletons shared (react, react-native, reanimated, gesture-handler, screens, safe-area-context). Everything else bundles independently with the remote. CI allowlist enforces this. No wildcards.

2. **Bridge pattern** — one-way plain JS object passed as prop from host to remote. ~8 methods: getAuthToken, getThemeTokens, getUser, navigateToHost, close, on(event), reportError. No published package, no shared stores, no shared React context.

3. **Auth** — RG owns its own session. ELMO provides handoff token via bridge. No shared auth library.

4. **No Zephyr for first pilot** — S3 + CloudFront + a JSON version manifest. Re-evaluate Zephyr if/when federating a second remote.

5. **Spike Re.Pack v5 before committing to Metro MF** — Metro MF is experimental; Re.Pack v5 has production case studies and has closed the perf gap. 1-week spike.

6. **Code signing mandatory** — SHA-256 ≠ authenticity. CI signs with private key, host verifies with public key before execution.

7. **One observability pipeline** — host's Elastic APM, not RG's Raygun in federated mode. RG calls bridge.reportError() for product errors.

8. **React/RN upgrade is Phase –1** — production ELMO is React 18/RN 0.76, PoC ran on React 19/RN 0.85. Upgrade is a prerequisite, not parallel.

9. **Estimate: 16–20 weeks realistic**, not 8–10. Missing: RN/React upgrade, Expo SDK bump, Re.Pack spike, binary size measurement, Hermes validation, cross-repo CI, code signing, auth backend.

## Key Version Gaps (as of 2026-07-14)
- ELMO: React 18.3.1, RN 0.76.3, Expo 52
- Rotageek: React 19.2.0, RN 0.83.5, bare RN (no Expo)
- PoC aligned at: React 19.2.3, RN 0.85.3

## RG Obs Stack (from repo inspection)
- Crash: Raygun (raygun4reactnative)
- Analytics: Firebase Analytics (track() is a no-op stub)
- Push: Firebase Messaging + Intercom
- CI/CD: GitHub Actions → Bitrise (not Jenkins, not EAS)
- Has CodePush (OTA JS updates) — separate deployment keys per env
- Versioning: manual workflow_dispatch, current v9.12.4
- No PagerDuty/on-call config in repo

## Related
- [[mf-prod-live]] (web MF is live in prod)
- Nathan's risk analysis: LMA1 page 4857758103
- Ola's proposal: LMA1 page 4850548998 (LMS-1175)
- Original evaluation: LMA1 page 4664295425 (LMS-906, recommended feature transfer)
- CTO brief: LMA1 page 4837801991 (committed to Option 1: theming Q1, feature transfer Q2)
- PRD: LMA1 page 4840587289 (ELMO↔RG App Merge)
- Artifact: https://claude.ai/code/artifact/b8031765-5a5a-4f06-b93c-10ece71b4a1f
