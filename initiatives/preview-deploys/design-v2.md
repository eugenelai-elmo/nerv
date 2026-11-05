## Branch previews on staging: design v2

**Status:** proposed design, 5 Nov 2026. It replaces the `__preview/` design in `summary.md`.
**Evidence:** `poc-findings.md`, which includes the bert live test that passed on 5 Nov.

### In plain English

An engineer, reviewer or QA person clicks a link on their own elmodev tenant. From then on their browser loads a chosen set of builds. That can be the PR's host, a PR's remote, or any mix of commits, for example host at commit A with contracts at commit B. Everything else stays real: the tenant, its login, its data and its backend. Nobody else on that tenant is affected. A banner shows what's being previewed and has an Exit button.

Builds aren't copied anywhere. CI already saves every master build to the artifacts bucket, keyed by commit. PR builds get saved the same way under `pr/`. The preview reads straight from there. The pieces:
- **The link** sets one cookie listing which build to use for each app.
- **The router Lambda** (FE-owned, already in the request path) serves the chosen host page.
- **A new path on the staging CDN, `/__artifacts/`**, serves every chunk from the artifacts bucket.
- **A small host plugin** loads each chosen remote from that path.

DevOps adds one CDN path, one bucket permission and one cleanup rule. We build everything else.

---

### Decisions: one answer each

| Question | Chosen | Rejected (one line each) |
|---|---|---|
| Where does the build map live? | **In the cookie itself.** `x-preview=platform=<ref>&contracts=<ref>`. The link carries the same query string. | Manifest file `previews/<id>.json`: another write path (router or CI must write it), another fetch, and an id to manage, all for a map under 600 bytes. |
| How do chunks reach the browser? | **One CloudFront path `/__artifacts/*` → artifacts bucket (OAC), immutable cache.** It serves host chunks and remote entries and chunks the same way. | Copy chunks into each serving bucket: needs writes into shared buckets for each stack (s, d, bert, b), gets wiped by `--delete` on bert/furryarms, and needs per-bucket cleanup. |
| How is the host page served? | **The router reads `platform/<sha>/index.html` (about 500 B) with its own role**, rewrites `"/_next/` to `"/__artifacts/<ref>/_next/`, and returns it. It caches in memory by sha, since the file is immutable. | The router switches the origin to the artifacts bucket: unproven whether OAC signs a Lambda-switched origin. A JS loader shell that `document.write`s the page: fragile. |
| How do later host chunks find `/__artifacts/`? | **Runtime `__webpack_public_path__`**, set from the cookie by a tiny module imported first in `main.tsx`. Without the cookie it's `'/'`, so prod is unchanged. | `publicPath: 'auto'`: resolves to `/_next/_next/…` because filenames already carry `_next/` (`rspack.config.cts:156-158`). Changing that changes prod. |
| How do remotes switch? | **A host MF runtime plugin** (`beforeRequest`) rewrites an overridden remote's entry to `/__artifacts/<ref>/remoteEntry.js`. Remote chunks follow on their own (remotes use `publicPath 'auto'`). Remotes not in the cookie load the normal staging copy. | Rebuilding the host with different remote URLs: one host build per combination, so mixing commits stops being free. |
| Who reads the cookie? | **The router (host page) and the browser (publicPath, remote plugin, banner).** Nothing is injected into the HTML and `config.js` is left alone. | Injecting `window.__PREVIEW__` and re-stamping `config.js`: more router code, and the CD stamping regex breaks on an already-stamped file. Nothing at runtime reads `config.mf` or `commitId` (telemetry uses the build-time hash). |
| Kill switch | **None beyond the `.elmodev.com` host guard.** To revert, redeploy the router. | LaunchDarkly flag: one more dependency and approval for a staging-only feature that is inert on prod by construction. |
| PR build retention | **PR builds go under `pr/<project>/<sha>/`, with a 14-day lifecycle on `pr/`.** Master builds are untouched. | One bucket-wide expiry: changes rollback retention for master builds. Object tags: `aws s3 sync` can't tag. |
| Compatibility check for mixed commits | **Not in v2.** The banner states that mixed commits are not checked. The default PR link uses "PR remote + current staging host", which is the same pairing CD deploys today. | `topology_hash`: it only covers the sharing config, not `@eff/*` or `@eds/react` versions. A real check needs new per-build metadata (see Later). |

---

### Flow

```
1. Click  https://acme.elmodev.com/__preview/on?platform=<shaA>&contracts=<shaB>
   router: each sha must be 40 hex and each name a known project;
           HeadObject pr/<p>/<sha>/<entry>, then <p>/<sha>/<entry>
           -> any missing: "Preview not found" page (404) naming it, Exit link
           -> all found: Set-Cookie x-preview=platform=pr/platform/<shaA>&contracts=contracts/<shaB>
                         (Secure; SameSite=Lax; Path=/; Max-Age=28800), 302 to /
2. GET /dashboard (default behaviour, uncached, router runs)
   cookie has platform -> GetObject <ref>/index.html (memory cache by ref)
                          rewrite "/_next/  ->  "/__artifacts/<ref>/_next/
                          return 200 text/html, no-store
   cookie has no platform -> today's behaviour (S3 website /index.html)
   TMS, API, POST paths -> untouched (proven live on bert)
3. Browser: first module sets __webpack_public_path__ = /__artifacts/<ref>/_next/
   chunks  GET /__artifacts/pr/platform/<shaA>/_next/123.<hash>.js   (CloudFront -> artifacts, cached)
   plugin  contracts -> /__artifacts/contracts/<shaB>/remoteEntry.js
           others    -> /_next/remotes/<name>/remoteEntry.js (staging, as today)
   banner  "Previewing: host pr@shaA · contracts @shaB  [Exit]"
4. Exit  /__preview/off -> clear cookie, 302 to /
```

### Cookie and link spec

- **Name:** `x-preview`. Host-only (no `Domain`), `Path=/`, `Secure`, `SameSite=Lax`, `Max-Age=28800` (8 h). Not `HttpOnly`, because the browser code reads it.
- **Value:** a query string, e.g. `platform=pr/platform/<sha>&contracts=contracts/<sha>`. Every value matches `^(pr/)?<project>/[0-9a-f]{40}$`, where `<project>` equals the key and is one of `platform` or the 8 remotes. Anything else invalidates the whole cookie, which then counts as no preview. The worst case is 9 entries, about 600 bytes.
- **Link (`/__preview/on`):** takes the same keys with bare 40-hex shas. The router resolves `pr/` vs master layout once, at link time, and writes the resolved refs. Link and cookie therefore have one format, and the runtime never guesses.
- **Hosts:** only `*.elmodev.com`. The router ignores the cookie everywhere else, so prod is inert by construction (tested in the spike).

### Router changes (elmo-application-lambda-router, FE-owned)

About 120 lines plus tests, on top of the spike's cookie parser:
1. `/__preview/on`, `/__preview/off`: validate, `HeadObject` each build, then Set-Cookie and 302, or show the not-found page.
2. In `processRoute`, when the target is `platformSpa` and the cookie has `platform`, return the rewritten artifacts `index.html` as a generated response instead of rewriting the URI.
3. A module-level `Map` cache of `ref → html`. Immutable keys mean no TTL is needed.
4. **IAM (same repo's Pulumi):** add an inline policy to `elmo-{stack}-platform-lambda-router-role`: `s3:GetObject` on `arn:aws:s3:::elmo-s-apse2-fe-artifacts-s3/*`. Without `s3:ListBucket`, a missing key returns 403 AccessDenied, so both 403 and 404 count as missing. The bucket is in the same account (924110976726), uses BucketOwnerEnforced and SSE-S3, and its policy has no Deny, so the identity policy alone is enough. No bucket-policy change is needed for the router.

### Host changes (elmo-frontend, FE-owned)

- `apps/platform/src/previewPublicPath.ts`: imported first in `main.tsx`. It reads the cookie and sets `__webpack_public_path__`. With no cookie it does nothing.
- `libs/module-federation/src/plugins/previewRemotesPlugin.ts`: registered in `registerMFPlugins` (`manifestLoader.ts:66-96`). Its `beforeRequest` hook rewrites overridden remotes. A failed overridden remote is never quietly replaced with the staging copy: it surfaces through the existing `errorLoadRemotePlugin` and the banner.
- A preview banner listing the active overrides, with an Exit link and a "mixed commits are not compatibility-checked" note when the shas differ.
- **Only host builds made after this lands can be previewed as the host.** Older hosts lack the publicPath module. Any remote build of any age can be previewed as a remote.

### Missing-preview guard

- At link time, the router checks every build before setting the cookie. A missing build gets a "Preview not found" page naming the app and commit (expired after 14 days, or never built), with an Exit link.
- On page load, if a host ref in an existing cookie has gone, the router returns the same page with status 404 instead of quietly serving staging. This fixes the gap the bert test showed.
- In the browser, an overridden remote that fails to load shows an error in the banner and stays failed. There's no silent fallback.

### CI step (elmo-shared-jenkinslib, FE-owned)

- On PR builds, after the build, sync **affected** projects only to `pr/<project>/<sha>/`, the same shape as `Jenkinsfile.horizon-deploy:176-190`.
- CI already computes `hostAffected` and `affectedRemotes`; a topology change marks everything affected.
- Then post one PR comment with the link: `?platform=<sha>` if the host is affected, plus `&<remote>=<sha>` for each affected remote. Unaffected remotes stay at what staging runs.
- **Storage:** the current staging build is 78 MB for the host and 23-38 MB per remote, with no source maps in artifacts. A typical push (host plus one remote) is about 110 MB. At 400 pushes a month with 14-day expiry, that's under 25 GB held, about $0.60 a month.
- **Build time:** the build already runs on PRs. The only addition is the sync, about 450 objects. Estimate 20-60 s; not measured.

### Infra asks (DevOps, exact)

1. **Terraform `platform-common/terraform/modules/tms-er-cf`:** add an origin `fe-artifacts` (`elmo-s-apse2-fe-artifacts-s3.s3.ap-southeast-2.amazonaws.com`, with a new S3 OAC). Add an `ordered_cache_behavior` for `/__artifacts/*` (GET/HEAD, cache policy `658327ea-…` Managed-CachingOptimized, compress, redirect-to-https). Add a viewer-request CloudFront Function on that behaviour only that strips the `/__artifacts` prefix (`request.uri = request.uri.slice(12); return request;`). An origin path can only add a prefix, not remove one. All of this is gated by a new variable `enable_preview_artifacts` (default `false`). Set it to `true` for the five elmodev instances: `environments/elmodev/apse2/dev/tms` (`tms-er-cloudfront`, `-build`, `-bert`) and `.../staging/tms` (`tms-er-cloudfront`, `tms-er-public-cloudfront`). Prod modules are unchanged.
2. **Bucket policy `elmo-s-apse2-fe-artifacts-s3`:** add a statement allowing `cloudfront.amazonaws.com` `s3:GetObject` on `arn:aws:s3:::elmo-s-apse2-fe-artifacts-s3/*`, with `AWS:SourceArn` in the five distribution ARNs (E2ZYOPZSRUANAJ, E3GNTEA7NEHY1W, E2JCIPOT1OF0WV, E3FSLMAVDO5CBN, E10UX3MPSODQUK). The artifacts hold the same JS and CSS that every tenant already downloads, with no source maps.
3. **Lifecycle on the same bucket:** expire objects under `pr/` after 14 days.

The prefix strip in ask 1 is needed because `/__artifacts/contracts/<sha>/x.js` must map to the key `contracts/<sha>/x.js`. The app's own routes (`/contracts`, `/dashboard`) rule out serving the bucket at the root. The function runs only on `/__artifacts/*`, never on the app's hot paths.

### What is still unproven

1. **Host chunks via a runtime publicPath:** whether any `mf-*` chunk loads before the first module runs. This is the main technical risk; the local POC should settle it.
2. **The remote override plugin itself:** `beforeRequest` rewriting under `manifest: false` together with `preloadSnapshotPlugin`. This needs a local POC.
3. **The router `GetObject` latency:** unmeasured. The estimate is 10-30 ms same-region on a cold container and zero after that (memory cache). Today's shell TTFB from Sydney is 125-185 ms.
4. **Mixed-commit safety:** `@eff/*` and `@eds/react` come from the host with `requiredVersion:false`, so a remote from a different commit silently uses the host's copy. React bumps throw (`strictVersion`). This is safe only for "PR remote + current staging host" (the CD pairing). Arbitrary mixes are at the user's risk until a check exists.
5. **The router pipeline's Pulumi can add the IAM inline policy.** Very likely, since it created the role, but not tried.
6. The full flow on a real tenant with a logged-in user. bert proved shell, chunks, remotes and passthrough, but without login.

### Later (not in v2)

- **Compatibility check:** CI writes `<project>/<sha>/mf-meta.json` with `{topologyHash, sharedVersions, libsTree}`, and the plugin blocks a React or topology mismatch and warns on `@eff/*` or `@eds/react` drift.
- Previews of `apps/menu-next` and `apps/external-assets` (served from their own CDNs).
