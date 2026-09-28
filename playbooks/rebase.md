# NERV `rebase` playbook

Bring the current branch up to date with its base, keep the slice's intent through any conflict, and prove nothing regressed. Repo-agnostic: every repo-specific value comes from the **profile** NERV prints alongside this playbook (`nerv … dev rebase`). Never substitute a guessed value for a profile field.

Derived from elmo-application's `/sync`, with flowmo's base-branch and precondition rules.

## Profile fields

| Field | Meaning |
|---|---|
| `repo` / `path` | Target repo. Run every git command as `git -C <path> …`. |
| `branch` / `head` | Current branch and commit — the **return point** if anything goes wrong. |
| `base` + `baseSource` | Branch to rebase onto, and how it was resolved. |
| `packageManager` | `pnpm` / `yarn` / `npm` / `bun`, from the lockfile. |
| `verify` | Commands that must all pass after the rebase. |
| `afterRebase` | Repo-specific regeneration steps (optional). |
| `slice` | Ticket + the plan/spec files describing the work on this branch (optional). |
| `blockers` | Preconditions that failed. **If any, stop and report them — do nothing else.** |

## 1. Preconditions

If `blockers` is non-empty, report them and stop. NERV checks: clean tree, on a named branch (not detached), no rebase/merge/cherry-pick in progress, and not already on `base`.

Record the return point (`branch`, `head`) in your report before changing anything.

## 2. Fetch

1. `git -C <path> fetch origin <base>`
2. If it fails with `RPC failed; curl 16 Error in the HTTP2 framing layer`, retry once with `git -C <path> -c http.version=HTTP/1.1 fetch origin <base>`.
3. Any other fetch failure (auth, host, DNS): report the remote URL (`git -C <path> remote -v`) and **ask** before changing it. Never rewrite a remote unprompted.
4. `git -C <path> log --oneline HEAD..origin/<base>` — if empty, report "already up to date" and skip to §6 only if the user asked for verification.
5. Untracked-path collisions (the profile only checked the last fetch): list files upstream adds with `git -C <path> diff --name-only --diff-filter=A HEAD...origin/<base>` and compare with `git -C <path> ls-files --others --exclude-standard`. Any overlap would make the rebase abort ("untracked working tree files would be overwritten") — report the paths and stop; don't move or delete them without approval.

## 3. Understand the slice, then assess risk

Read every file listed under `slice` first. You need the slice's **intent** — what it is meant to change and which acceptance criteria it serves — before judging any conflict.

Then summarise:

- Upstream: `git -C <path> diff --stat HEAD...origin/<base>`
- Branch: `git -C <path> diff --stat origin/<base>...HEAD`
- Overlap: files touched on both sides. Flag each against the slice intent (does the slice depend on this file's behaviour?).

## 4. Rebase

`git -C <path> rebase origin/<base>`

On conflict, for each file:

1. Read both sides and the conflict markers.
2. Resolve by the slice intent: keep what the slice needs to meet its plan/ACs; adopt upstream structural and cosmetic changes (imports, formatting, lint, renames).
3. If a config file the branch modified was moved or deleted upstream, find where the setting now lives and apply the branch's change there.
4. `git -C <path> add <file>` then `git -C <path> rebase --continue`.
5. If the right resolution is ambiguous, or would drop behaviour the slice needs, **stop and ask**.

Never `rebase --abort`, `reset`, `checkout --`, or discard work without explicit approval. If the user wants out, the return point is `head` on `branch`.

## 5. Dependencies and generated code

- If the lockfile for `packageManager` changed upstream, run its install (`pnpm install`, `yarn install`, `npm install`, `bun install`).
- Run each `afterRebase` step whose condition applies.

## 6. Verify

Run every `verify` command (in parallel where safe). All must pass before calling the rebase clean.

On failure: decide whether it comes from the branch, the rebase resolution, or upstream. Fix branch/rebase causes when the fix is clear and re-run; report upstream failures without masking them.

## 7. Push — only on request

Do not push by default. If asked: `git -C <path> push --force-with-lease origin <branch>` (retry with `-c http.version=HTTP/1.1` on the HTTP/2 framing error). Never plain `--force`.

**flowmo-delivered branches** (`slice.flowmo` is true): a rebase changes the reviewed diff, so flowmo's push gate will require its code review (Phase 7.6) and verify gate to run again before the push is allowed. Say so; don't work around the gate.

## 8. Report

| Check | Result |
|---|---|
| Return point | `branch` @ `head` |
| Base | `base` (`baseSource`) |
| Upstream commits | N, notable subjects |
| Conflicts | clean, or N resolved (note any that touched slice-critical files) |
| Dependencies / regen | what ran |
| Verify | each command: pass / fail |
| Push | skipped, or refreshed (flowmo gate re-run needed?) |

Flag regressions and the next action if anything is blocked.
