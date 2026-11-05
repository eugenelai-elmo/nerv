## Preview deploys on staging (elmodev): spike findings

**Date:** 2026-11-05 · **Scope:** confidence spike, nothing live was changed · **Related:** ESL-4192, ESL-3726

### Verdict: ADJUST, then GO

The idea works, but the real elmodev set-up makes a smaller design possible. That design is cheaper and safer than the one in `summary.md`:

- **You don't need a CloudFront Function or any Terraform to start.** Two facts make this possible. The page shell (default behaviour) is never cached, and it already sends every cookie to the router Lambda. And JS chunks are content-hashed and deployed additively with no `--delete`. So the router Lambda can read `x-preview` itself and serve `/__preview/<branch>/index.html`. That preview `index.html` then loads hashed chunks from the normal `/_next/` path, and remotes the branch didn't change come from prod.
- **The FE team owns the router Lambda and its deploy.** The `elmo-application-lambda-router` Jenkins pipeline deploys with Pulumi and re-associates the Lambda with the distributions itself (`Jenkinsfile` lists E2JCIPOT1OF0WV, E3FSLMAVDO5CBN, E10UX3MPSODQUK, E2ZYOPZSRUANAJ, E3GNTEA7NEHY1W). The core path needs nothing from DevOps.
- **We only need the original URI-rewrite-everywhere design if we later want branch-scoped unhashed assets** (`_images`, remoteEntry overrides without a rebuild). As written it has one real defect, in mismatch M3 below.

Two things are still unproven and need a live check (see Q5): a remote changed on the branch, and the whole flow on a real tenant hostname.

---

### Q1: Does real elmodev match the design's assumptions?

Read-only survey of account 924110976726 (CloudFront ListDistributions/GetDistributionConfig/GetFunction/GetCachePolicy, S3 List/GetBucket*).

**Which distributions serve which tenants**

| Distribution | Aliases | Stack / bucket | Router Lambda |
|---|---|---|---|
| E2ZYOPZSRUANAJ "TMS/ER - Staging" | `*.elmodev.com`, `*.dev.elmodev.com` (catches hrcoretest3, pv2xerxes02, hrlab, …) | s / `elmo-s-platform-apse2-spa-s3` | `elmo-s-platform-lambda-router-ae80388:96` |
| E3GNTEA7NEHY1W "Staging public" | ertest05, ertest04, ereagles03, tmsapp, buggernaut, nexus3, breathestaging | s / same bucket | same s Lambda |
| E2JCIPOT1OF0WV "Development" | **ereagles04, acme**, ecom, kong, horizon, nexus2, shayan01-03, … (15) | d / `elmo-d-platform-apse2-spa-s3` | `elmo-d-platform-lambda-router-cc3323c:152` |
| E3FSLMAVDO5CBN | bert.elmodev.com | d / `elmo-bert-platform-apse2-spa-s3` | d Lambda |
| E10UX3MPSODQUK | furryarms.elmodev.com | `elmo-b-platform-apse2-spa-s3` | d Lambda |

So "staging" covers **5 distributions and 2 Lambdas**, not one. The tenants Eugene named are spread across them: ereagles04 and acme are on the *dev* stack.

**Behaviours (the same on all five):** default → `kong-lb` (TMS) with origin-request router. `/_next/*`, `/_next/remotes/*/remoteEntry.js`, `/config.js` and `/_images/*` → `platform-spa`. Then `/js/*.js`, `/css/*.css`, `/assets/*`, `/bundles/*/*.js`, `/fonts/*` and `/imagecache/*` → Kong. `/scorms/*` → S3, and `/cobra/api/{integrations,recruitment}/*` → BFF.

**Mismatches with `summary.md`**

| # | Design assumed | Reality | Impact |
|---|---|---|---|
| M1 | Default behaviour is cached, so a header-based approach poisons the cache | Default behaviour uses legacy ForwardedValues with **Cookies: all, Headers: `*`, QueryString: true**, so CloudFront does not cache it at all | The cache-poisoning finding doesn't apply to these distributions. The router runs on every page-shell request and sees the cookie. A header or cookie on the default behaviour is safe. |
| M2 | One distribution to change | 5 distributions, 5 viewer functions (`tms-er-viewer-request-function-{s,s-public,d,d-bert,b}-apse2`), 2 Lambdas, 3+ buckets | A CF Function design means 5 function updates and 5 sets of behaviour associations. A router-only design is 1 code change, deployed by the existing pipeline. |
| M3 | Rewrite every URI on every behaviour, and the Lambda strips the prefix | The default behaviour serves **all of TMS and its APIs** through Kong. The router returns early for `POST` (`src/index.js:745` on origin/master) and leaves unmatched paths alone. | With rewrite-everywhere, every TMS page, API call and POST would reach Kong as `/__preview/<b>/…` and 404. The Lambda patch in the design would have to strip the prefix on every code path, including the POST early return and "skip" routes. **This is a real defect in the design as written.** The build test showed the same thing: `/api/*`, `/cobra/*`, `/ckfinder/*` and `/oauth2-server/*` broke when rewritten. |
| M4 | The CF Function is only on the default behaviour and needs adding to SPA behaviours | True. SPA behaviours have no function. | Only needed for the CF variant. |
| M5 | Runtime may be js-1.0 | All five tms-er functions are **cloudfront-js-2.0**, with identical trailing-slash code | No upgrade needed. |
| M6 | SPA cache policies might include cookies | `/_next/*`, `/config.js`, `/_images/*` use **Managed-CachingOptimized** (no cookies, headers or query string; 1 day TTL). `remoteEntry.js` uses **Managed-CachingDisabled**. | No cache fragmentation. Viewer functions still see the cookie. A URI rewrite would isolate the cache key as the design says. |
| M7 | S3 origin with an index document | `platform-spa` is the **S3 REST endpoint as a custom origin** (no OAC; the bucket is public-read). The router switches the origin to the **s3-website** endpoint for SPA routes, and that endpoint has an `ErrorDocument: index.html`. | A missing preview `index.html` falls back to the prod shell (with status 404) rather than erroring. A missing asset gives 403 from the REST endpoint. |
| M8 | Lifecycle rule exists or is easy to add | No lifecycle on any of the three platform-spa buckets (the CD pipeline comment claims 30/60 days, but nothing is configured) | `__preview/` cleanup must be explicit in Jenkins, or a lifecycle rule must be requested. This is a small DevOps ask, and the only one. |
| M9 | No custom error pages | Confirmed: `CustomErrorResponses.Quantity = 0` on all four checked | Answers Q3 condition 3: there's no CloudFront error page that could bypass the function and serve prod. |
| M10 | `/config.js` from the preview prefix | `config.js` is per-stack (s and d differ: 731 vs 735 bytes) and stamped at deploy | Don't rewrite `config.js` by default. The preview uses the stack's config, with the wrong `commitId` in telemetry. It's acceptable for testing; noted. |
| M11 | Root fonts in the bucket | `NotoSans_*.ttf` sit at the bucket root. No behaviour matches them, so they take the default behaviour, where no router rule matches, so they go to Kong. | This is how staging behaves today and it's unrelated to previews. Flag it separately if fonts 404 on staging. |

---

### Q2: Does the logic work? (offline)

**Harness:** a local worktree of the lambda-router repo, using its own Jest suite (it was already set up for this). There was also one subagent for the build test, because that work was heavy and independent.

Worktree: `~/Projects/wt-router-preview-spike`, branch `spike/preview-cookie-routing`, commit `23665f1`. **Not pushed.** The repo's Jenkins pipeline deploys the Lambda to distributions, and I didn't want a branch build to risk a dev deploy.

- **Router patch** (`src/index.js`, about 60 lines): `getPreviewBranch()` parses the `x-preview` cookie, converts `/` to `--`, and allows only `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` with no `..`. It only acts on hosts ending `.elmodev.com`, so prod is inert by construction. The `frontend-branch-preview-staging` LD flag is checked per tenant **only when a valid cookie is present**, so requests without the cookie cost nothing extra. Both `request.uri = "/index.html"` sites now call `spaIndexUri(previewBranch)`.
- **Tests:** all **448 existing tests pass unchanged**, and there are **30 new tests** (`src/__tests__/preview.test.js`), so 478 pass. They cover:
  - no cookie → `/index.html`, the same as today;
  - cookie with the flag on → `/__preview/feat--abc/index.html`;
  - flag off → identical to no cookie (the kill switch);
  - bypass routes (`/login/`, `/onboard-assist`);
  - route flag off for the tenant → request falls through to Kong unchanged;
  - TMS and API paths and root fonts → byte-identical;
  - POST untouched;
  - `SITE_PLATFORM_SPA` (bert → bert bucket, preview path kept);
  - prod host with a cookie → unchanged, and the flag is never evaluated;
  - traversal, bad encoding, unicode, `?`/`#`, over-long and empty values all rejected;
  - an LD `variation` that throws → preview off, routing still works.
- **CloudFront Function variant** (`cloudfront-function/viewer-request.js`, with 6 local emulation tests that pass): it keeps the existing trailing-slash logic, and rewrites only `/_next/*` and `/_images/*` on `.elmodev.com` when the cookie is valid. It never rewrites the default behaviour or `config.js`. **I couldn't run it in the real runtime:** `cloudfront:CreateFunction` is denied for the platform-mcps role. Nothing was created. The code is ES5-safe apart from `includes`/`endsWith`, which the existing js-2.0 functions already use.

---

### Q3: Does a branch build run from a prefix?

This was run by a subagent. It built `apps/platform` plus all 8 remotes from origin/master `948a285e3` using CI's deploy command, served the build under `__preview/test/` with a Node rewrite server, and loaded it in headless Chromium.

**Result: yes, with conditions.** All 521 asset requests resolved inside the prefix, and `loadRemote` succeeded for all 8 remotes. It works because:
- `publicPath: '/'` (`apps/platform/rspack.config.cts:152`);
- remote URLs are root-relative and baked in at build time (`module-federation.config.ts:13-21`, `manifest: false`; `libs/module-federation/src/manifestLoader.ts` confirms there's no runtime manifest fetch);
- remotes use `publicPath: 'auto'` (`createRemoteRspackConfig.ts:63`);
- fonts are root-relative and there's no service worker.

Conditions, and how each design handles them:

| Condition | Rewrite-everywhere (summary.md) | Router-only (recommended) |
|---|---|---|
| Non-SPA paths (`/api`, `/cobra`, `/ckfinder`, `/oauth2-server`, `/bundles`, `/careers`, `/callback`) must not be rewritten | Broken. Needs the Lambda to strip the prefix everywhere (M3). | Not affected. The URI is only changed when routing to platformSpa. |
| External CDN assets (EDS3 menu `main-v2.0.6.js` at `libs/api/src/endpoints/constants.ts:72`, Kore `koreai.js`, ThoughtSpot external-assets) can't be previewed | Same limitation | Same limitation. `apps/menu-next` and `apps/external-assets` changes won't show. |
| Unhashed files need `no-store` (the browser caches by URL, not cookie) | Needed for index.html, config.js, `_images`, remoteEntry | Only the preview `index.html`, which lives at a different S3 key and is served through the uncached default behaviour. `Jenkinsfile.site-deploy` doesn't set no-store on remoteEntry.js today. Fix that anyway. |
| Prefix must hold the full host plus all 8 remotes (about 304 MB with maps), because a pure rewrite has no fallback | Yes | No. Unchanged remotes load from prod's `/_next/remotes/<name>/remoteEntry.js`. Upload only hashed host chunks (additive, the same as a normal deploy) and one `index.html`. |
| Preview needs its own stamped `config.js` | Yes | Optional. It uses the stack's config, and only telemetry `commitId` is wrong. |

**Not yet proven for router-only:** a branch that changes a *remote*. The host bakes remote URLs at build time, so a preview build would need a build-time override that points the changed remote at an immutable path, e.g. `/_next/remotes/<name>/__preview/<branch>/<sha>/remoteEntry.js`. That path matches the CachingDisabled remoteEntry behaviour, and the remote's chunks follow through `publicPath: 'auto'`. This is a small FE change in `module-federation.config.ts` plus jenkinslib, and it isn't written yet. Until it lands, router-only covers host and module changes but not remote-only changes.

Evidence: `~/Projects/elmo-frontend-wt-preview-spike` (branch `spike/preview-prefix-build`, no source changes). Probe files are in the lead session scratchpad: `preview-server.mjs`, `probe.mjs`, `probe.json`.

---

### Q4: Cheaper alternatives

| Option | What it gives | Cost | Verdict |
|---|---|---|---|
| (a) `Jenkinsfile.site-deploy` per-team site | A whole tenant runs a branch (bert today) | Each new site needs its own distribution + bucket + `SITE_PLATFORM_SPA` entry + DevOps. That's one branch per site, shared by everyone on that site, and only for tenants that have a site. | Works today for bert. Doesn't scale to "any engineer, any tenant", and still blocks peers on a shared slot. Keep it for long-lived integration branches. |
| (b1) Chrome Local Overrides (Confluence "Feature branch on a shared environment w/ Chrome Local Overrides", Sowmen Rahman, Sep 2026) | One engineer sees a local host build on any tenant | Zero infra. Manual DevTools setup per person, only on that machine, can't be shared with a PO or reviewer, and fiddly with remotes. | A good stopgap for the author. It doesn't solve "reviewer/QA can test before merge", which is the tech leads' complaint. |
| (b2) ESL-3726 `?mf-override` | Swap one remote's URL | About 30 lines, but it's **Closed and never implemented** (`git grep mf-override` finds nothing on master). It only covers remotes, not host or module code. | Too narrow on its own. It complements router-only for the remote case above. |
| (c) Router-only cookie preview (this spike) | Anyone with the cookie sees the branch on any elmodev tenant, against the real backend, without affecting others | About 60 router lines (done), a jenkinslib preview-upload step, an LD flag, and a cleanup job. The FE pipeline deploys everything; the only DevOps ask is a lifecycle rule. | **Best value.** |
| (d) Rewrite-everywhere CF Function (summary.md) | Same as (c), plus branch-scoped unhashed assets | 5 viewer functions, 20 behaviour associations, Terraform/DevOps, the M3 fix, full 300 MB preview uploads, and a deploy-order hazard | Not worth it now. Revisit only if (c) hits a wall. |

---

### Q5: Live POC (staged, not created)

**Smallest live proof: bert only, with a separate POC Lambda.** bert is already the FE feature-deploy sandbox. It has its own distribution (E3FSLMAVDO5CBN) and bucket, and only the shared d Lambda association links it to other tenants.

Resources (all nonprod 924110976726):
1. **New Lambda@Edge function** `elmo-bert-platform-lambda-router-preview-poc` (us-east-1, nodejs22.x, 1024 MB, 5 s). The code is the d-stack router with `SUBST_*` values for d plus commit `23665f1`. It reuses the existing router execution role, read-only. Publish version 1.
2. **One association change:** E3FSLMAVDO5CBN default behaviour, origin-request → `…preview-poc:1`, replacing `elmo-d-platform-lambda-router-cc3323c:152`. No other distribution is touched. Note that the next router pipeline run to development will re-associate :152 automatically, because the Jenkinsfile lists E3FSLMAVDO5CBN. Pause dev router deploys during the POC, or accept the revert.
3. **LD flag** `frontend-branch-preview-staging` (boolean, default off) in the d-stack LD environment, targeted to user key `bert`.
4. **S3 upload to `elmo-bert-platform-apse2-spa-s3`:** the branch's hashed host chunks go into `_next/` (additive, no `--delete`). `index.html` goes to `__preview/spike-test/index.html` with `no-store`. The branch should be a host-only change that's visible on screen, e.g. a banner.
5. **Test:**
   - with no cookie on bert, check pages are unchanged;
   - with `document.cookie="x-preview=spike-test; path=/; domain=bert.elmodev.com"`, check the banner shows, APIs work, remotes load and login works;
   - from a second browser with no cookie, check you see master;
   - turn the flag off and check you're back to master within about 30 s (LD cache TTL).

**Cost:** about $0. Lambda@Edge requests on one tenant plus about 50 MB of S3.
**Risk:** limited to bert users. Rollback is one association swap, which takes about 5 minutes to deploy.
**Teardown:** re-associate `:152` on E3FSLMAVDO5CBN, delete `__preview/` in the bert bucket, and archive the LD flag. Delete the POC Lambda once its edge replicas drain, which takes a few hours.

**Approvals needed (exact):**
- "Create Lambda `elmo-bert-platform-lambda-router-preview-poc` in us-east-1 (nonprod) from lambda-router commit 23665f1 and publish v1."
- "Change E3FSLMAVDO5CBN (bert.elmodev.com) default-behaviour origin-request association from `elmo-d-platform-lambda-router-cc3323c:152` to `elmo-bert-platform-lambda-router-preview-poc:1` for the POC; revert after."
- "Create LD flag `frontend-branch-preview-staging` (default off) in the d-stack environment, targeting tenant `bert`."
- "Upload one preview build to `s3://elmo-bert-platform-apse2-spa-s3` (hashed `_next/` chunks + `__preview/spike-test/index.html`)."
- Optional: "Pause development deploys of application-lambda-router during the POC window." Also check who is using bert first.

**Alternative with no AWS permission needed:** Eugene, or whoever owns the router pipeline, opens the branch as a PR and runs a **development** deploy. That puts the patched router on the d Lambda for bert, furryarms and dev tenants (ereagles04, acme, …). It's inert unless both the cookie and the flag are present, which the tests show. This is closer to the real rollout, but it touches the shared dev Lambda.

---

### Recommended next step

1. Approve the bert POC above. About half a day including the build upload.
2. If it's green, build the remaining pieces:
   - jenkinslib `preview` step on PR builds (upload hashed chunks plus `__preview/<branch>/index.html`, cleaned up on merge or close);
   - the remote-override build knob for remote changes;
   - a cookie-setting bookmarklet or `/preview` page;
   - one DevOps ask: a `__preview/` lifecycle rule on the s, d and bert buckets.
3. Then deploy the router to development, then staging, behind the flag. Rewrite `summary.md` around router-only, and keep the CF variant as a fallback.

---

### Live POC on bert.elmodev.com (5 Nov 2026): PASSED

Approved steps 1, 2 and 4 only. No LaunchDarkly flag was created: the POC Lambda build had the preview path hard-enabled, and the real branch keeps the LD kill switch. Account 924110976726 was checked before every write, using the `elmodev.AWSAdministratorAccess` SSO profile.

**What ran**
1. **Lambda** `elmo-bert-platform-lambda-router-preview-poc:1` (us-east-1). The code was the *deployed* `elmo-d-platform-lambda-router-cc3323c:152` package with the `23665f1` patch applied. Deployed :152 is origin/master plus the `SUBST_*` values, so the patch applied cleanly. It used the same role, runtime (nodejs22.x), memory and timeout as :152.
2. **S3 (bert bucket):** 380 new hashed chunks went into `_next/`. None of those keys existed before (checked against the full pre-POC listing). `__preview/spike-test/index.html` was uploaded with `no-store`. The build was a host-only build (`nx run platform:build`, `ENABLE_MODULE_FEDERATION=true`) of origin/master `948a285e3`. Its only change was a fixed magenta banner "BRANCH PREVIEW: spike-test" plus `window.__BRANCH_PREVIEW__`.
3. **E3FSLMAVDO5CBN:** the default-behaviour origin-request association was switched from :152 to the POC :1, and the distribution reached Deployed.

**Results** (curl probes, plus one headless Chromium with two contexts)

| Check | No cookie | `x-preview=spike-test` |
|---|---|---|
| Shell `/login/`, `/dashboard/` | 200, prod `main.bc3068c256f6176f.js` (same bytes as the baseline before the switch) | 200, preview `main.82e1f6918f33deee.js` |
| TMS page `/admin` | 302 → `/`, identical | 302 → `/`, identical |
| TMS `/controlpanel/`, API `GET /api/v1/me` | 404, same size as the baseline (Kong) | same |
| `POST /api/v1/login`, `POST /login` | 404, same size as the baseline | same |
| `config.js`, `remoteEntry.js` | identical bytes | identical bytes (served from prod paths as designed) |
| Browser: banner | absent | **present** (screenshot `04-cookie-login.png`) |
| Browser: `_next/*` requests | 232, 0 non-2xx | 232, 0 non-2xx |
| Browser: `loadRemote` on all 8 remotes | 8/8 ok | **8/8 ok**. The preview host (master Nov 5) ran against bert's Oct 12 remotes. |
| Malicious cookie `..%2F..%2Fx` | n/a | prod shell (rejected) |
| Missing preview `x-preview=does-not-exist` | n/a | **prod shell with HTTP 404** (`x-amz-error-detail-key: __preview/does-not-exist/index.html`). The page renders, but the status is 404. |

The 404 bodies differ per request because they contain request IDs, so those rows compare status and size. The tenant logo image was broken in both modes; that's an existing bert issue, not caused by the POC.

**Cleanup** (pass or fail order, as briefed)
1. The association was reverted to `elmo-d-platform-lambda-router-cc3323c:152`. The reverted config was asserted byte-identical to the pre-POC config, and the distribution reached **Deployed**.
2. bert was re-verified after the revert. Without the cookie it matches the baseline. With the cookie it now gets the prod shell, so the POC is fully off.
3. The 381 keys I uploaded were deleted (the list was saved and checked first). The `_next/` listing is identical to the pre-POC listing, and `__preview/` is empty.
4. The POC Lambda can't be deleted yet: "replicated function" (Lambda@Edge replicas take hours to clear). It's no longer associated with anything. A background retry runs every 30 min for 8 h. If it gives up or the SSO session expires, run `aws lambda delete-function --region us-east-1 --function-name elmo-bert-platform-lambda-router-preview-poc --profile elmodev.AWSAdministratorAccess`.
5. Both worktrees are removed. The router branch `spike/preview-cookie-routing` @ `23665f1` is kept locally and not pushed. The frontend spike branch had no commits and was deleted. The banner change is saved as `frontend-marker.patch`.

Evidence: `/private/tmp/claude-502/-Users-eugene-lai-Projects-nerv/c4027c87-aea2-42b5-8ee2-cf326a970726/scratchpad/poc/`:
- probe outputs: `01-`, `03-` and `07-*.txt`
- browser JSON and screenshots: `04-*`
- distribution configs: `E3FSLMAVDO5CBN-*.json`
- key lists: `uploaded-keys.txt`, `bucket-next-*.txt`

The copies of the deployed Lambda code (which contain the LD SDK key) were removed from the scratchpad.

**Next steps (out of scope this round)**
- **Remote override:** a build-time knob so a branch that changes a remote points the preview host at `/_next/remotes/<name>/__preview/<branch>/<sha>/remoteEntry.js`.
- **Missing-preview safeguard:** the router could check the key exists, or the shell could show a "preview not found" banner and clear the cookie. Today a stale cookie silently serves the prod shell with a 404 status.
- **jenkinslib PR preview upload** (hashed chunks + `__preview/<branch>/index.html`), with cleanup on merge, and a `__preview/` lifecycle rule (the DevOps ask).
- **Real-branch rollout:** create the LD flag (needs approval), then deploy the router to development, then staging.
