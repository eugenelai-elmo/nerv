## Preview Deploys — Branch Previews for elmo-frontend

**Goal:** Let any contributor preview their branch's frontend code without deploying to shared staging. A reviewer opens the app with a cookie set and sees the branch build instead of production.

**Why now:** Multiple contributors have asked for branch previews. The current model (staging-only) is inherited from the old satellite Frontend team structure, where a small team shared one staging slot. With CODEOWNERS and higher PR throughput post-GitHub-migration, the bottleneck on staging previews is increasingly painful. Eugene flagged this as a top FE platform pain point to NingNing (Sep 2026).

**Repo:** `elmo-software/elmo-frontend` (GitHub). Infra changes in CloudFront + S3 (DevOps-managed).

**Jira:** [ESL-4192](https://elmolearning.atlassian.net/browse/ESL-4192) (Story, Open). Related: ESL-3726 (MF override query param — different mechanism, narrower scope).

**Status:** Design done + architecture review complete (Oct 2026). Cache poisoning gap found and resolved in revised design. Eugene spikes the CF Function + Lambda@Edge patch before handing off.

**Since:** 2026-09-01

---

### Design — Cookie-Scoped Bundle Overlay (Revised Oct 2026)

A CloudFront Function on the existing distribution reads a cookie (`x-preview=<branch-name>`) on viewer-request. If present, it rewrites the request URI by prepending `/__preview/<branch>/` to the path. The app loads as normal — same HTML shell mechanism, same auth, same APIs — but with the preview branch's JS/CSS bundles resolved from the preview prefix in S3.

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

### Two-Layer Routing (URI-Rewrite-Everywhere)

The existing CloudFront distribution has two routing layers that must both be preview-aware:

1. **CF Function (viewer-request)** — attached to ALL cache behaviors (default + SPA):
   - Reads `x-preview` cookie
   - Rewrites URI by prepending `/__preview/<branch>/` prefix on every behavior
   - Same code path everywhere — no header vs. rewrite split
   - On exception or missing cookie: returns request unmodified (try/catch)

2. **Lambda@Edge patch (origin-request)** — on default behavior only:
   - Detects `/__preview/<branch>/` prefix in the URI
   - Strips the prefix, performs normal picomatch + LaunchDarkly routing
   - When routing to platformSpa: rewrites to `/__preview/<branch>/index.html` instead of `/index.html`
   - No prefix = existing behavior unchanged (~10 lines added)
   - Gated behind LaunchDarkly flag (infra already reads LD from DynamoDB)

**Why URI-rewrite-everywhere (not header-based):**
Architecture review (Oct 2026) found that a header-based approach on the default behavior creates a **cache poisoning risk** — production and preview requests share the same cache key (the URI), so a preview user's cache miss could serve preview HTML to all production users. URI rewriting makes the cache key include the preview prefix, isolating cache entries automatically. No cache policy changes needed.

**Request flow:**
```
Browser: GET /dashboard  (cookie: x-preview=feat--new-onboarding)

1. CloudFront matches /dashboard → default behavior
2. CF Function (viewer-request): reads cookie, rewrites URI to
   /__preview/feat--new-onboarding/dashboard
3. Cache lookup (key = rewritten URI) — miss
4. Lambda@Edge (origin-request):
   - Detects /__preview/feat--new-onboarding/ prefix, strips it
   - Runs normal picomatch on /dashboard → route to platformSpa
   - Rewrites URI to /__preview/feat--new-onboarding/index.html
5. S3 returns preview index.html

Browser: GET /_next/main.xyz789.js  (cookie: x-preview=feat--new-onboarding)

1. CloudFront matches /_next/* → SPA behavior (direct to platform-spa)
2. CF Function (viewer-request): reads cookie, rewrites URI to
   /__preview/feat--new-onboarding/_next/main.xyz789.js
3. Cache lookup (key = rewritten URI) — miss
4. No Lambda@Edge on this behavior
5. S3 returns preview JS bundle
```

---

### Infra Required (DevOps)

**Terraform (platform-common):**
1. Attach CF Function to ALL SPA cache behaviors (`/_next/*`, `/_next/remotes/*/remoteEntry.js`, `/config.js`, `/_images/*`) — currently only on default behavior.
2. Update `viewer_request_function_code` variable with preview-aware version (merges with existing trailing-slash rewriter).
3. Verify CF Function runtime is `cloudfront-js-2.0` (needed for `let`/`const`/arrow functions). Upgrade from 1.0 is a one-line change if needed.

**Pulumi (elmo-application-lambda-router):**
4. Add ~10 lines: detect `/__preview/<branch>/` prefix, strip for routing, restore for index.html rewrite.
5. Gate behind LaunchDarkly flag for instant rollback.

**Jenkins (elmo-shared-jenkinslib):**
6. On PR builds, upload built bundle to `s3://<serving-bucket>/__preview/<branch>/`.
7. Post-merge hook: delete the preview prefix.

**S3:**
8. No new bucket — preview builds go under `/__preview/<branch>/` prefix in existing serving bucket.
9. S3 lifecycle rule: delete `__preview/*` objects older than 14 days (safety net).

---

### S3 Layout

```
elmo-<stack>-platform-apse2-spa-s3/          ← serving bucket (existing)
├── index.html                                 ← production
├── config.js
├── _next/
│   ├── main.abc123.js
│   └── remotes/
│       ├── contracts/remoteEntry.js
│       └── dashboard/remoteEntry.js
│
└── __preview/                                 ← new prefix
    └── feat--new-onboarding/                  ← branch (slashes → dashes)
        ├── index.html
        ├── config.js
        ├── _next/
        │   ├── main.xyz789.js
        │   └── remotes/
        │       ├── contracts/remoteEntry.js   ← only if changed
        │       └── dashboard/remoteEntry.js
        └── deploy-manifest.json               ← for cleanup
```

---

### Security

The `x-preview` cookie value becomes part of the S3 object key. Sanitise in the CF Function:
- Strip path traversal (`..`, leading `/`)
- Allow only `[a-zA-Z0-9._-]` (convert slashes to dashes)
- Cap length (64 chars)
- Invalid values → request passes through unmodified (no preview, no error)

---

### Phased Plan

#### Phase 0: Eugene spikes (pre-handoff)
- [ ] Write the **CF Function** (~40 lines). Cookie read + URI rewrite for all behaviors. Merge with existing trailing-slash logic. Test with CF Function test harness.
- [ ] Write the **Lambda@Edge patch** (~10 lines). Prefix detection, strip, route, restore. Test locally against existing handler.
- [ ] Document the **Terraform changes** needed: attach CF Function to all SPA behaviors, verify runtime version.
- [ ] Document the **S3 layout** and Jenkins upload interface.
- [ ] Write up the DevOps ask as two scoped requests: (a) Terraform — CF Function on SPA behaviors, (b) Pulumi — Lambda@Edge patch.

#### Phase 1: DevOps provisions + deploys
- [ ] Terraform: attach CF Function to all SPA cache behaviors.
- [ ] Terraform: update `viewer_request_function_code` with preview-aware version.
- [ ] Pulumi: deploy Lambda@Edge patch. **Deploy order: Lambda@Edge first, CF Function second.** Reverse for rollback.
- [ ] Jenkins: PR builds sync to `s3://<serving-bucket>/__preview/<branch>/`.
- [ ] Jenkins: post-merge hook deletes the preview prefix.

#### Phase 2: Developer experience
- [ ] Bookmarklet or `/preview` page to set the cookie.
- [ ] S3 lifecycle rule (delete `__preview/*` objects older than 14 days).
- [ ] Optional: LaunchDarkly flag to restrict preview to internal tenants during rollout.
- [ ] Contributor docs.

---

### Deploy Order (Critical)

**Deploy: Lambda@Edge first, CF Function second.**
If reversed: CF Function rewrites asset URIs to preview prefix, but Lambda@Edge (not yet updated) serves production `index.html` → production HTML references production-hashed filenames that don't exist under the preview prefix → 404 on every chunk → white screen for preview users.

**Rollback: CF Function first (revert), Lambda@Edge second.**
With the CF Function reverted, no URIs are rewritten, so the Lambda@Edge patch is inert (no prefix to detect).

The LD flag on the Lambda@Edge provides a seconds-level killswitch independent of deploy order.

---

### MF Remote Previews

Host + remote previews work together in Phase 1 — no separate extension needed. The CF Function rewrites ALL `/_next/*` requests uniformly, including `/_next/remotes/<name>/remoteEntry.js` and its chunks. The browser sees original URLs; CloudFront rewrites them transparently. No manifest loader changes needed.

---

### Risks & Open Questions

- **Bundle size in S3:** Every open PR uploads a full bundle. S3 lifecycle rules + Jenkins cleanup needed to avoid unbounded growth.
- **CF Function on hot path:** `/_next/*` is tens of thousands of requests/min. Function must be defensive (try/catch, early return on no cookie, ~0.1ms). A syntax error in the function → 503 for ALL users on that behavior.
- **Partial deploy:** See Deploy Order above. LD flag mitigates.
- **CF Function runtime:** Verify `cloudfront-js-2.0` (ES6+). If currently on 1.0, upgrade is a one-line Terraform change but is a deploy-time swap.
- **Cookie forwarded to S3:** S3 ignores unknown cookies (harmless). Verify SPA cache policies don't include cookies in cache key (would fragment cache by branch name).
- **Stale preview after merge:** If reviewer still has cookie set after PR merges and S3 cleanup runs, they get 404s. Consider: redirect to production with a message, or rely on natural cookie clearing.

---

### Files Involved

- **CloudFront Function**: extend existing viewer-request function (~40 lines added)
- **`platform-common/terraform/modules/tms-er-cf/`**: attach CF Function to SPA behaviors, update function code variable
- **`elmo-application-lambda-router/src/index.ts`**: ~10-line patch for prefix detection
- **`elmo-shared-jenkinslib/src/elmo/jenkins/TypescriptS3FrontendCIPipeline.groovy`**: upload step for PR builds
- **S3**: `__preview/` prefix in existing serving bucket
- **Developer tooling**: bookmarklet or `/preview` page (new, small)

---

### Architecture Review (Oct 2026)

Full review artifact: https://claude.ai/artifact/14o1c84MAoo8ArYZq5xgeF

Key findings from review against actual infra (platform-common, elmo-application-lambda-router, elmo-frontend):
1. **Cache poisoning risk** (fixed): Header-based approach on default behavior shared cache keys between production and preview. Resolved by switching to URI-rewrite-everywhere.
2. **Multi-behavior coverage** (fixed): CF Function was only on default behavior. Must be on all SPA behaviors.
3. **Lambda@Edge awareness** (fixed): Origin-request Lambda unconditionally overwrites URI to `/index.html`. Must detect and preserve preview prefix.
4. **MF remotes work for free**: Universal URI rewriting covers host + remotes together. No separate extension needed.
5. **Deploy ordering matters**: Lambda@Edge must deploy before CF Function to avoid broken-page scenario.

Independent AWS architect review confirmed: event ordering correct, header propagation works (but unnecessary with URI rewrite), same CF Function on multiple behaviors has no limit, S3 website hosting with prefix is clean, cache isolation via URI rewrite is automatic.

---

### On the Q2 Delivery Plan

Stretch goal, S5-S6 (Dec 2026). Contingent on:
1. Eugene completing the Phase 0 spike.
2. DevOps availability in December to provision infra.

If DevOps is on leave in Dec → Q3.
