<!-- loops/execution.md -->
# Execution Loop

## New Task? Start Here

1. Has the user given you an issue ID or task description?
   - If yes → go to Phase 1: Understand
   - If no → ask: "What would you like to work on?"

2. Is there already a `plan.md` in `.ai/artifacts/active/<ID>/`?
   - If yes → skip to Phase 2: Build
   - If no → start at Phase 1: Understand

3. Read the project overlay at `.ai/loops/execution.md` for:
   - Verify commands
   - Test runner
   - Branch naming
   - Project-specific rules

Then follow the phase checklists below.

---

## State Management

Artifacts live in `.ai/artifacts/active/<ISSUE-ID>/`.

### State File

Every issue has `.ai/artifacts/active/<ISSUE-ID>/state.json`:

```json
{
  "issueId": "PROJ-123",
  "phase": "understand|build|ship|done",
  "classification": "bug|feature|refactor|config|docs",
  "branch": "feat/PROJ-123-short-slug",
  "worktree": "~/Projects/<repo>-worktrees/PROJ-123",
  "completedSteps": [],
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

**Rules:**
- Create state.json at triage start (phase: `understand`)
- Update `phase` + `completedSteps` as steps complete
- Every command reads state.json first — resume, never restart
- Transition to `build` only when plan approved
- Transition to `ship` only when verification passes

### Write Guard

Code writes are ONLY allowed when:
1. `state.json` phase is `build`
2. Target file is inside the worktree path

Exceptions: artifact files (`.ai/artifacts/`), memory files, state.json itself.

---

## Branch Naming

| Classification | Prefix | Example |
|----------------|--------|---------|
| bug | `bugfix/` | `bugfix/PROJ-123-fix-auth` |
| feature | `feat/` | `feat/PROJ-123-add-export` |
| refactor | `refactor/` | `refactor/PROJ-123-split-module` |
| config | `chore/` | `chore/PROJ-123-update-deps` |
| docs | `docs/` | `docs/PROJ-123-api-docs` |

---

## Phase 1: Understand

### 1a. Triage

- [ ] Create `.ai/artifacts/active/<ISSUE-ID>/`
- [ ] Create state.json (phase: `understand`, completedSteps: [])
- [ ] Fetch ticket context if ticket ID provided
- [ ] Check for existing branches/PRs — avoid duplicate work
- [ ] Classify: bug | feature | refactor | config | docs
- [ ] Estimate blast radius, flag risks
- [ ] Write `brief.md`
- [ ] Update state.json: add `triage` to completedSteps

**Gate:** brief.md exists with classification + blast radius. User confirms.

### 1b. Analysis

- [ ] Read state.json — if triage not complete, suggest running triage first
- [ ] Explore affected code paths (Serena for symbols, Grep/Glob for patterns)
- [ ] Map dependencies and call chains
- [ ] Identify patterns to follow
- [ ] Write `analysis.md`
- [ ] Update state.json: add `analysis` to completedSteps

**Gate:** analysis.md exists with code paths, dependencies, patterns. User confirms.

### 1c. UI Audit (skip if no UI change)

- [ ] Fetch design specs if URL provided
- [ ] Screenshot current state
- [ ] Document gaps between spec and current
- [ ] Write `ui-audit.md`

**Gate:** ui-audit.md exists, or phase explicitly skipped.

### 1d. Plan

- [ ] Read state.json — if analysis not complete, suggest running analysis first
- [ ] Ordered file-change list with specific files
- [ ] Numbered, testable acceptance criteria
- [ ] Test strategy: unit / integration / E2E per criterion
- [ ] Edge cases
- [ ] Derive branch name → write to state.json
- [ ] Write `plan.md`
- [ ] Update state.json: add `plan` to completedSteps

**Gate:** plan.md with acceptance criteria reviewed. User approves.

---

## Phase 2: Build

**On entry:** Read state.json. Verify `plan` is in completedSteps. Set phase: `build`.

- [ ] Create worktree: `git worktree add <worktree-path> -b <branch> origin/main`
- [ ] Update state.json: set worktree path
- [ ] **TDD loop** per acceptance criterion:
  - RED: Write failing test
  - GREEN: Implement until test passes
  - REFACTOR: Clean up, re-run tests
- [ ] Run verify commands (from project overlay) after each meaningful change
- [ ] Check each acceptance criterion — mark pass/fail with evidence
- [ ] Write `verification.md`
- [ ] Update state.json: add `build` to completedSteps

→ **Gate: Build Complete**
→ if code changes: load `.ai/base/loops/quality.md`
→ if auth/input/API touched: load `.ai/base/loops/security.md`
→ if perf concern or significant bundle change: load `.ai/base/loops/performance.md`

**Gate:** All tests pass, verification.md exists with evidence per criterion. User confirms.

---

## Phase 3: Ship

**On entry:** Read state.json. Verify `build` in completedSteps. Set phase: `ship`.

- [ ] Rebase on latest main: `git fetch origin main && git rebase origin/main`
- [ ] Post-rebase: re-run verify commands — all must pass
- [ ] Commit in worktree, push branch
- [ ] Create PR with: ticket title, summary, acceptance criteria, QA script
- [ ] Return PR link to user
- [ ] Update ticket status if applicable
- [ ] Write `pr-summary.md`
- [ ] Update state.json: set phase: `done`, add `ship` to completedSteps

→ if infra/prod/deploy changes: load `.ai/base/loops/reliability.md`

**Gate:** Branch rebased, checks pass, PR link delivered, state.json phase=done.

---

## Lightweight Mode

For config/docs/one-line fixes:
1. Skip to build directly — user provides context verbally
2. Create minimal state.json with phase: `build`
3. Still requires worktree + branch naming
4. Still requires verify + ship gates
5. No artifact directory needed

## Resume Protocol

On context reset:
1. Check `.ai/artifacts/active/` for state.json where phase ≠ `done`
2. Read state.json: issue ID, current phase, completed steps, worktree path
3. Verify worktree still exists
4. Report: "Found existing work for <ID> in <phase>. Resuming."
5. Continue from next incomplete step

---

## Tool Gating

| Tool | Understand | Build | Ship |
|------|-----------|-------|------|
| Serena | Y | Y | - |
| Figma | UI Audit only | - | - |
| Browser tool | UI Audit | Y (demo) | - |
| Ticket tracker | Y (lean) | - | Y (lean) |
| Context7/docs | Y | Y | - |
| Subagents | Y (research) | Y (parallel tasks) | - |
