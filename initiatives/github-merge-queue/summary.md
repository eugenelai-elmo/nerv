## GitHub Merge Queue — elmo-software/elmo-frontend

**Goal:** Enable GitHub's native merge queue on `master` to prevent broken-master from concurrent merges.

**Why now:** 9+ commits from 6 authors in 5 hours (9 Sep 2026). Commit c4d5e27 (PR #37) landed with a red `jenkins/branch` check — 3 more PRs merged on top while it was still failing. Only one required PR check (`jenkins/pr-head`), "require up to date" is OFF, no merge queue. CODEOWNERS migration lowered review friction, so velocity will climb.

**Repo:** `elmo-software/elmo-frontend` (GitHub, migrated from Bitbucket `elmodevelopment/elmo-application`). Eugene is admin.

---

### Current State (verified 9 Sep 2026)

**Branch protection (classic rule, id 82655330):**
- 1 approval, dismiss stale, require CODEOWNERS review, require conversation resolution
- Required check: `continuous-integration/jenkins/pr-head` (commit status, `app_id: null`)
- `strict: false` (not requiring up-to-date)
- Enforce admins: OFF

**Org ruleset (Global Branch Restrictions, id 21497810):**
- Restrict deletions + block force pushes on `~DEFAULT_BRANCH`. No other rules.

**Repo settings:**
- Squash-only merges, delete branch on merge, auto-merge OFF
- Webhook: `jenkinsv2.elmotalent.com.au/github-webhook/`

**Jenkins (elmo-shared-jenkinslib):**
- Multibranch pipeline (confirmed by `env.BRANCH_NAME` usage in `runPipeline.groovy`)
- PR builds → context `continuous-integration/jenkins/pr-head`
- Branch builds → context `continuous-integration/jenkins/branch`
- `PipelineHelper.groovy:31`: `context.branch = BRANCH_NAME == "master" ? null : ...`
- Non-master branches get `BuildFlows.REVIEW` (build + lint + test, no deploy) — correct for merge queue validation
- Credential `github-elmodevops-token` exists (used for checkout)

---

### The Blocker: Status Context Mismatch

Merge queue pushes candidates to `refs/heads/gh-readonly-queue/master/<sha>`. Jenkins sees this as a **branch build** (not a PR), so it reports `continuous-integration/jenkins/branch`. But the required check is `continuous-integration/jenkins/pr-head`. The queue hangs waiting for a context that never reports.

**The build logic itself is fine** — merge queue branches get `REVIEW` flow (build + lint + test, skip deploy), which is exactly what we want.

---

### Phased Plan

#### Phase 0: Safe, independent changes (no blockers)
- [ ] Enable auto-merge: `gh api -X PATCH repos/elmo-software/elmo-frontend -f allow_auto_merge=true`
- [ ] (Optional) Convert classic branch protection → ruleset via API

#### Phase 1: Verify Jenkins discovers merge queue refs
- [ ] Push a test branch `gh-readonly-queue/master/test-000` to elmo-frontend
- [ ] Confirm Jenkins triggers a build for it
- [ ] If NO build triggers → need Jenkins admin (Aaron/Tarun) to widen branch discovery filter
- [ ] Delete test branch

#### Phase 2: Bridge the status context (Jenkinsfile change)
- [ ] Verify `github-elmodevops-token` has `repo:status` scope (or can POST commit statuses)
- [ ] Add merge-queue status bridge to `Jenkinsfile` in elmo-frontend (NOT shared lib):

```groovy
// Wrapper approach — detect merge queue branches, post pr-head context
if (env.BRANCH_NAME?.startsWith('gh-readonly-queue/')) {
    withCredentials([usernamePassword(credentialsId: 'github-elmodevops-token', ...)]) {
        sh "curl -X POST .../statuses/${sha} -d '{\"context\":\"continuous-integration/jenkins/pr-head\",...}'"
    }
}
```

- [ ] Test with a real merge queue candidate (low-risk PR)

#### Phase 3: Enable merge queue
- [ ] Enable "Require merge queue" on the ruleset (batch size = 1, no batching)
- [ ] Pilot on 2–3 low-stakes PRs
- [ ] Leave "require up to date" OFF (redundant with merge queue)
- [ ] Monitor for 1 week

#### Phase 4: Tune (only after Phase 3 is stable)
- [ ] Consider raising batch size above 1 for throughput
- [ ] Consider adding more required checks if gaps are identified

---

### Rejected Alternatives

| Option | Why rejected |
|--------|-------------|
| Just turn on "require up to date" | O(n²) pile-up with 6+ authors and ~1 merge/20 min. Gets worse as CODEOWNERS friction drops. |
| Swap required check to `jenkins/branch` | Branch builds don't report for PRs — would remove the PR gate entirely. |
| GitHub Actions full CI | Duplicates Jenkins. Not justified until Jenkins is sunset. |
| GHA status bridge (wait for `jenkins/branch`, copy to `pr-head`) | Fragile timing, race conditions, opaque failure mode. |
| Modify shared Jenkins lib | Impacts all repos. Jenkinsfile wrapper is scoped to this repo only. |

---

### External Dependencies

| Who | What | Status |
|-----|------|--------|
| Aaron Pejakovic / Tarun Manoharan (DevOps) | Confirm Jenkins branch discovery includes `gh-readonly-queue/*` | Not yet asked |
| DevOps | Confirm `github-elmodevops-token` credential scope includes `repo:status` | Not yet asked |

---

### Related

- CODEOWNERS migration: ESL-4156, PR #13 (merged 9 Sep 2026)
- Module Federation: 12 remotes, reduces shared-file conflicts over time
- elmo-shared-jenkinslib: `elmodevelopment/elmo-shared-jenkinslib` (Bitbucket)
