# legacy/

Parked Go CLI scaffold from the previous ai-kernel direction (submodule-overlay detector).

Not opposed to the current memory-layer MVP — just a different slice. Kept for:

- `install.sh` / release workflow — reusable for distributing the bash scripts once they stabilise.
- `loops/*.md`, `substrate/*.md`, `templates/` (still at repo root) — reusable as tier-2+ agent prompts.
- `cmd/init.go` submodule-add logic — may come back if we ship `ai-kernel init` that scaffolds `.ai/memory/` into a target repo.

See `PLAN.md` §11 for the full disposition.
