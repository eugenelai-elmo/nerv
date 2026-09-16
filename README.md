# AI Kernel — Command Seat

Cross-repo command seat for Claude Code sessions. Manages engineering leadership skills, initiative state, and sprint tooling across all repos.

Previously a memory substrate experiment (archived at `archive/memory-substrate-v1`). Revived Sep 2026 as the versioned home for the manager stack.

## Structure

```
CLAUDE.md                         # Command seat project instructions
skills/                           # Manager stack skills (versioned here)
  sitrep/SKILL.md                 # Morning briefing / mid-day catch-up
  sprint/SKILL.md                 # Sprint planning + refinement
initiatives/                      # Cross-repo initiative state
.claude/                          # Claude Code config
  settings.json                   # Project settings (non-secret)
  skills/                         # Symlinks to repo-level skills (gitignored)
```

## Skill Discovery

Skills in `skills/` are made available to Claude Code via symlinks from `~/.claude/skills/`:
```bash
ln -s ~/projects/ai-kernel/skills/sitrep ~/.claude/skills/sitrep
ln -s ~/projects/ai-kernel/skills/sprint ~/.claude/skills/sprint
```

## Initiative Structure

Each initiative folder contains:
- `summary.md` — canonical state (architecture, milestones, blockers, people, links)
- `working-plan.md` — sprint-by-sprint breakdown (when it exists)
- `risks.md` — risk register (when it exists)
- Session-specific files as needed

## Routing Rule

| Layer | Owns | Does not own |
|---|---|---|
| `initiatives/` | Mutable working state for long-running efforts | Repo-specific execution artifacts |
| `skills/` | Manager stack skill definitions (versioned) | Repo-level dev skills (those stay in their repos) |
| Per-repo `.ai/` | Repo-specific execution state | Initiative-level context |
| Claude Code memory | User preferences, feedback rules, references | Initiative working state |

## Repos

See `CLAUDE.md` for the full repo table and conventions.
