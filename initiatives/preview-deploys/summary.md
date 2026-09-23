## Preview Deploys — Branch Previews for elmo-frontend

**Goal:** Let any contributor preview their branch's frontend code without deploying to shared staging. A reviewer opens the app with a cookie set and sees the branch build instead of production.

**Why now:** Multiple contributors have asked for branch previews. The current model (staging-only) is inherited from the old satellite Frontend team structure, where a small team shared one staging slot. With CODEOWNERS and higher PR throughput post-GitHub-migration, the bottleneck on staging previews is increasingly painful. Eugene flagged this as a top FE platform pain point to NingNing (Sep 2026).

**Repo:** `elmo-software/elmo-frontend` (GitHub). Infra changes in CloudFront + S3 (DevOps-managed).

**Status:** Design done (conversation, Sep 2026). Not yet spiked or built. Eugene spikes the CF Function prototype before handing off.

**Since:** 2026-09-01

---

### Design — Cookie-Scoped Bundle Overlay

A CloudFront Function on the existing distribution reads a cookie (`x-preview=<branch-name>`) on viewer-request. If present, it rewrites the S3 origin path from the production prefix to the branch's preview prefix. The app loads as normal — same HTML shell, same auth, same APIs — but with the preview branch's JS/CSS bundles.

**How a reviewer uses it:**
1. Set the cookie (bookmarklet, browser extension, or a `/preview <branch>` page).
2. Navigate the app — they see the branch code.
3. Clear the cookie to return to production.

No cookie = production. The overlay is per-viewer, not per-environment.

**Why this approach:**
- No separate preview environments to manage (no extra domains, no extra deployments).
- Production-faithful — same APIs, same data, same auth. The only thing that changes is the JS bundle.
- Cookie-scoped = safe. Other users on the same URL see production.
- CloudFront Functions are lightweight (< 1ms), run at edge, no Lambda cold start.

---

### Infra Required (DevOps)

1. **S3 prefix or bucket** for preview bundles (e.g. `s3://elmo-frontend-previews/<branch>/`).
2. **CloudFront Function** on the existing distribution — viewer-request event, reads `x-preview` cookie, rewrites origin path.
3. **Jenkins pipeline change** — on PR builds, upload the built bundle to the preview S3 location. Cleanup: delete the prefix when the PR is merged/closed.

None of these are large asks individually, but they need DevOps to provision.

---

### Phased Plan

#### Phase 0: Eugene spikes the CF Function (pre-handoff)
- [ ] Write the CloudFront Function locally (JS, ~30 lines). Test with CF Function test harness.
- [ ] Confirm the cookie-to-origin-path rewrite works against a mock S3 structure.
- [ ] Document the expected S3 layout and Jenkins upload interface.
- [ ] Write up the DevOps ask as a clear, scoped request (not "we need preview deploys").

#### Phase 1: DevOps provisions infra
- [ ] S3 bucket/prefix created with appropriate IAM policies.
- [ ] CF Function deployed to the existing distribution (viewer-request).
- [ ] Jenkins pipeline updated to upload branch builds on PR events.

#### Phase 2: Build the developer experience
- [ ] Bookmarklet or simple `/preview` page to set the cookie.
- [ ] Cleanup automation — delete preview bundles when PR merges/closes (Jenkins post-merge hook or S3 lifecycle rule).
- [ ] Documentation for contributors.

---

### Risks & Open Questions

- **Bundle size in S3:** Every open PR uploads a full bundle. S3 lifecycle rules or Jenkins cleanup needed to avoid unbounded growth.
- **MF remotes:** Preview needs to handle Module Federation — the host loads remotes from CF. A preview cookie on the host doesn't change which remote version loads unless the remote is also previewed. For now, this covers host-only previews. Remote previews are a later extension.
- **Cache invalidation:** CF Function runs on viewer-request (before cache). Preview bundles are origin-resolved, so CF cache keys include the rewritten path. No invalidation needed — different paths = different cache entries.

---

### Files Involved

- CloudFront Function: new (JS, ~30 lines, viewer-request)
- S3: new bucket or prefix for preview bundles
- `elmo-shared-jenkinslib/src/elmo/jenkins/TypescriptS3FrontendCIPipeline.groovy` — upload step for PR builds
- Developer tooling: bookmarklet or `/preview` page (new, small)

---

### On the Q2 Delivery Plan

Stretch goal, S5-S6 (Dec 2026). Contingent on:
1. Eugene completing the Phase 0 spike.
2. DevOps availability in December to provision infra.

If DevOps is on leave in Dec → Q3.
