# CLAUDE.md — Cross-Repo Command Seat

This is Eugene's cross-repo command seat. Sessions launched here coordinate across all repos rather than being anchored to one.

## Repos

| Repo | Path | Purpose |
|------|------|---------|
| **elmo-application** | `~/Projects/elmo-application` | Nx monorepo — platform frontend (React/TypeScript, module federation, rspack/Vite) |
| **elmo-design-system** | `~/Projects/elmo-design-system` | `@eds/react` component library |
| **platform-common** | `~/Projects/platform-common` | Shared backend/infra |
| **elmo-shared-jenkinslib** | `~/Projects/elmo-shared-jenkinslib` | CI/CD shared library |
| **elmo-application-lambda-router** | `~/Projects/elmo-application-lambda-router` | Lambda routing layer |
| **performance-management-system** | `~/Projects/performance-management-system` | PMS backend |
| **flowmo** | `~/Projects/flowmo` | Flowmo agent tooling |
| **elmo-skills-marketplace** | `~/Projects/elmo-skills-marketplace` | Claude Code skills marketplace |
| **ai-kernel** | `~/projects/ai-kernel` | Cross-repo memory experiment (paused) |

## Local State

| Path | Purpose |
|------|---------|
| `~/.ai/initiatives/` | Cross-repo initiative state (architecture, milestones, blockers, people) |
| `~/.ai/.ai/` | Symlink → `elmo-application/.ai/` (kernels, artifacts, execution state) |
| `~/.ai/.claude/skills/` | Symlink → `elmo-application/.claude/skills/` |
| `~/.ai/.claude/commands/` | Symlink → `elmo-application/.claude/commands/` |

## Elmo Application Conventions

When working on `elmo-application` code from this seat, follow these rules (sourced from `elmo-application/AGENTS.md`):

- **Module boundaries**: `packages/` → `libs/` → `modules/` → `apps/`. Modules never import from other modules or packages. Enforced by `pnpm run check:boundaries`.
- **Permissions**: `@eff/capabilities` only. Never check `metadata?.actions` directly. `<Can I="action" a="resource">`.
- **Tasks**: Run via nx (`pnpm nx run …`), not the underlying tool directly.
- **E2E**: Playwright + `playwright-bdd`. `.feature` files under `e2e/features/`, steps under `e2e/steps/`.
- **Repository**: Bitbucket, not GitHub. Don't assume GitHub-specific features.
- **Code review**: Use `/eff:review` skill for any review request.

## Rules

- Always interrogate for more information before implementing. Ask clarifying questions.
- Never modify files outside the scope of the current task.
- Source changes must include corresponding test updates. See `~/Projects/elmo-application/docs/testing.md`.
- If you hit a problem, explain what happened and what you've tried before asking for help.
- Do NOT add Co-Authored-By lines to git commits.
- Always work on a branch, never on master. Use worktree if unrelated to current branch.

## Releases (elmo-application)

- **Release notes**: `cd ~/Projects/elmo-application && pnpm --silent generate:release-notes-from-deployed -- <TARGET_HASH>`
- **Risk assessment**: `cd ~/Projects/elmo-application && pnpm --silent assess:release-risk -- --from-deployed <TARGET_HASH>`

## Tools

- Prefer Serena's semantic tools when working in a repo with LSP support.
- For git operations, always specify the repo path: `git -C ~/Projects/<repo> ...`
