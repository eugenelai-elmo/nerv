# CI Speedup — TypeScript S3 Frontend CI Pipeline

**Status:** Active — analysis done, execution pending
**Since:** 2026-04-29 (spike), validated 2026-09-09
**Pipeline:** `TYPESCRIPT_S3_FRONTEND_CI` in `elmo-shared-jenkinslib`
**Repo:** `elmo-shared-jenkinslib` (pipeline) + `elmo-application` (package.json, nx.json)

## Baseline (PR-37 #6, 31m1s total)

- CHECKOUT: 12.6s
- BUILD (build 5m58s + lint 7m25s, parallel): 12m27s wall
- UNIT_TEST: 17m19s (56% of total)
- TRIVY: 15.8s; SONAR/DEPLOY skipped

### UNIT_TEST breakdown

1. `test:ensure-browser` (~40s) — `playwright install --with-deps chromium` from scratch every run. OS apt packages (~70) + browser binary (~280MB). Fresh k8s pod, nothing cached.
2. `nx affected --target=test --parallel=2` (15m22s wall) — 44 projects affected. Actual vitest execution: 8m15s (494.6s). ~7min is orchestration overhead (Node + Vite/Vitest boot + TS resolution + Chromium launch per project, capped at 2 workers).
3. `test:a11y` (~1m13s) — chained serially via `&&`. 2 projects (recruitment, hr-core). Includes a second `test:ensure-browser` call (near-instant, already cached from step 1).

### Key structural facts

- **Zero Nx cache hits** across all stages (build, lint, test). No remote cache configured. Ephemeral k8s pods discard local cache.
- **--parallel=2** hardcoded in `package.json`, not the Jenkinsfile. Unittest container has no resource requests/limits (unlike a11y/e2e which request 3 CPU / 8Gi).
- **44/56 testable projects affected** on this run (69 total workspace projects). Possibly inflated by shared lib dependency graph — needs multi-PR sampling to confirm.
- **6 heavy projects** account for ~5min of 8m15s real test time: modules-performance (65.6s), modules-hr-lab-salary-intelligence (57s), platform (53.7s), modules-career-development (49.9s), modules-hr-lab-capability-forecast (46s), eff-api (26.5s). Other 38 average ~4s each.

## Priority actions (by structural impact)

### 1. Remote Nx cache (5-12min savings on typical PRs)

Biggest single lever. Eliminates re-execution of unchanged projects. 38 of 44 projects averaged ~4s — mostly boot overhead, not real tests. With cache, those are instant.

- No `nxCloudAccessToken`, `runner`, or `remoteCache` in `nx.json` — just `defaultBase: "master"`.
- `cache: true` is set on test/a11y/lint/check:types targets already — plumbing is in place, just needs a backend.
- Options: Nx Cloud (SaaS, simplest) or self-hosted (more ops).
- **Team decision required** — involves infra, cost, and potentially security review for cache trust.

### 2. Fix affected scope — ROOT CAUSE FOUND (16 Sep 2026)

**Root cause identified:** The `test` target in `nx.json` uses `"default"` as a self-input, which includes `{projectRoot}/**/*` (all files including test files). When a test file changes in a shared lib like `eds-react`, Nx marks the project as changed. Every downstream project with `^production` dependency then re-runs — even though `eds-react`'s production output didn't change. A single test file change in `eds-react` triggers **48 of 56 projects** (86%).

**Evidence:** `git diff HEAD~1` touched only `packages/eds-react/src/field/Field.a11y.test.tsx`. `nx show projects --affected --with-target=test --base=HEAD~1` returned 48 projects. The `^production` input correctly excludes test files for *dependencies*, but the `"default"` self-input doesn't.

**Fix:** Change the test target's self-input from `"default"` to `"production"` plus a test-file-only self-glob. This way test-file changes invalidate only the project's own tests, not every downstream consumer. Free, ~1 hour, no vendor.

**Expected impact:** 48→~5 affected on a typical test-file-only PR. Biggest single CI lever. Makes Nx remote cache (paid) unnecessary for most PRs.

**Previous suspect was wrong:** The issue is not barrel files or `eff-config` sitting high in the graph. `eds-react` genuinely has 48 dependents — the graph is correct. The problem is the *invalidation input*, not the graph shape.

### 3. Raise --parallel (3-4min savings)

Going from `--parallel=2` to `--parallel=4` roughly halves the ~7min orchestration overhead. Each worker launches headless Chromium for browser-mode specs.

- **Prerequisite:** Add explicit resource requests to the `nodejs-unittest` container in `TypescriptS3FrontendCIPipeline.groovy` (currently uncapped — OOM risk). Check k8s node allocatable first.
- Change lives in `package.json` `test` script, not the Jenkinsfile.

### 4. Custom unittest image with Playwright system deps (~40s savings)

The `apt-get install` of ~70 OS packages is the bulk of the ~40s `test:ensure-browser` tax. A PVC for `~/.cache/ms-playwright` only caches the browser binary (~15s), not the apt packages.

- Options: (a) build a custom image with playwright system deps pre-installed, (b) use `cypress/included` (already used for a11y/e2e containers) as the unittest base, (c) use `mcr.microsoft.com/playwright` as the base.
- Lowest-effort: option (b) — pattern already exists in the pipeline.

### 5. Merge test:a11y into nx affected --targets=test,a11y (~30s savings)

Eliminates the second `nx affected` graph computation + vitest boot for 2 projects. One-line change in `package.json`.

- Verify the two targets don't fight over Chromium processes (both use `--browser.headless`).
- The second `test:ensure-browser` call inside `test:a11y` is near-instant (cached from first call), so removing it saves negligible time but would break standalone `pnpm run test:a11y`.

## Files involved

- `elmo-shared-jenkinslib/src/elmo/jenkins/TypescriptS3FrontendCIPipeline.groovy` — pipeline stages, container defs, resource requests
- `elmo-application/package.json` — `test`, `test:a11y`, `test:ensure-browser` scripts, `--parallel=2`
- `elmo-application/nx.json` — cache config, target defaults, no remote cache
- `elmo-application/scripts/ci/affected-base.sh` — affected base resolution

## Caveat

Single-run sample. Absolute timings vary with agent contention and diff size. Structural findings (no caching, parallel=2 cap, redundant browser install, serial a11y chain) are architecture-level and hold across runs.
