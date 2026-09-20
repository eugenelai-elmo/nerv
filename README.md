# NERV — Command Seat

Cross-repo command seat for Claude Code sessions. Manager stack skills, initiative state, sprint tooling, and the observatory (deep observability).

Previously `ai-kernel` (memory substrate experiment, archived at `archive/memory-substrate-v1`). Revived and renamed Sep 2026.

## Structure

```
CLAUDE.md                         # Command seat project instructions
skills/                           # Manager stack skills (versioned here)
  sitrep/SKILL.md                 # Morning briefing / mid-day catch-up
  sprint/SKILL.md                 # Sprint planning + refinement
spikes/                           # Exploration spikes (Jev, etc.)
observatory/                      # Deep observability workspace (ex command-centre)
  CLAUDE.md                       # 34KB observability context (ES, SonarQube, MF health)
initiatives/                      # Cross-repo initiative state
.claude/                          # Claude Code config
  settings.json                   # Project settings (non-secret)
  skills/                         # Symlinks to repo-level skills (gitignored)
```

## Skill Discovery

Skills in `skills/` are made available to Claude Code via symlinks from `~/.claude/skills/`:
```bash
ln -s ~/projects/nerv/skills/sitrep ~/.claude/skills/sitrep
ln -s ~/projects/nerv/skills/sprint ~/.claude/skills/sprint
```

## Launch

```bash
cd ~/projects/nerv && claude          # command seat (daily ops)
cd ~/projects/nerv/observatory && claude  # deep observability dive
```

`~/.ai/` symlinks here for backward compatibility.

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
| `observatory/` | Deep observability context and queries | Daily quick-pulse (that's sitrep) |
| Per-repo `.ai/` | Repo-specific execution state | Initiative-level context |
| Claude Code memory | User preferences, feedback rules, references | Initiative working state |

## Repos

See `CLAUDE.md` for the full repo table and conventions.
