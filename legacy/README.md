# ai-kernel

Reusable AI agent kernel for Claude Code. Consume as a git submodule — projects get a process loop, substrate protocols, and tool bindings without copying files.

## Quick Start

```bash
# Install CLI (once)
curl -fsSL https://raw.githubusercontent.com/eugenelai-elmo/ai-kernel/main/install.sh | sh

# Add to a project
cd ~/Projects/my-repo
ai-kernel init
.ai/bin/ai-kernel detect
```

## What's included

- `CLAUDE.md` — boot context (zero token cost)
- `substrate/` — memory, navigation, agent coordination protocols
- `loops/execution.md` — full dev cycle with progressive disclosure gates
- `loops/quality|security|performance|reliability|strategic.md` — on-demand loops
- `templates/` — brief, plan, analysis, pr-summary, verification
- `tool-defaults.md` — default tool bindings

## CLI

```bash
ai-kernel init      # scaffold .ai/, add submodule
ai-kernel detect    # scan codebase → generate .ai/ overlays
ai-kernel check ~/Projects/repo1 ~/Projects/repo2  # staleness report
ai-kernel update    # git submodule update --remote
```
