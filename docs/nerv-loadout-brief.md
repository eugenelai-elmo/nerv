# nerv loadout — Skill Procurement & Vetting

## Concept
Pre-mission skill preparation: scan public skill registries, vet for security, score for relevance to current work patterns, and surface recommendations. Never auto-installs — Eugene decides.

## Sources (researched 2026-09-22)

| Registry | Type | Catalog size | API | Quality signals | Notes |
|---|---|---|---|---|---|
| **skills.sh** | Marketplace | 282+ skills, 1.5M installs | REST `/api/v1/skills` (Vercel OIDC auth), CLI `npx skills search` | Install count, Socket/Snyk/Gen Agent Trust Hub audits | Primary source — largest, most signals |
| **OpenAgentSkill** | Registry + recommendation | ~hundreds | **Public REST, no auth**: `POST /api/agent/resolve?task=<desc>&agent=codex` | Trust score (0-100), quality score, GitHub stars, maintenance freshness, audit warnings | Best discovery API — task→skill matching built in |
| **agentskills.io** | Spec site | N/A | None | N/A | Official Agent Skills standard (Anthropic). Reference only, not a data source |
| **SkillPad** | GUI wrapper | Wraps skills.sh | None (desktop app) | Inherits skills.sh | Not useful programmatically |
| **elmo-skills-marketplace** | Internal | Internal skills | Local filesystem | Trusted, internal | ~/Projects/elmo-skills-marketplace |

## Pipeline
1. **Discover** — OpenAgentSkill `/api/agent/resolve` (task→skill recommendation, no auth) + skills.sh (trending/hot, CLI or scrape)
2. **Filter** — minimum install count / trust score, recency, exclude already-installed (diff against ~/.claude/skills/ and ~/.claude/projects/*/skills/)
3. **Security vet** (two gates):
   - **Third-party audits**: skills.sh audit data (Socket, Snyk, Gen Agent Trust Hub) — must pass
   - **Local content scan**: Laya `guard_questions()` on SKILL.md content — prompt injection, exfil patterns, suspicious instructions ("ignore previous", data exfiltration, credential access)
4. **Relevance score** — Laya batch-scores skill descriptions against recent work patterns (radar items, recent prompts, installed skills, git activity)
5. **Present** — top 3-5 candidates with: name, source, install count / trust score, security status, relevance score, one-line description
6. **User decides** — `nerv loadout install <source>/<skill>` wraps `npx skills add` with audit confirmation

## Security model
- Skills = executable instructions in agent context = supply chain attack surface
- Two-layer vetting: third-party audits (skills.sh) + local content scan (Laya guard)
- SHA-256 hash on install, checked for drift on load
- Never auto-install — human approval gate
- `nerv loadout audit` re-scans installed skills against latest audit data

## Scorer integration
- Laya `guard_questions()` preset for security content scanning (local, fast)
- Laya batch scoring for relevance (speed, free, handles 100+ descriptions in ~2s)
- Decision definition: `decisions/skill-relevance.json` (score type: irrelevant → essential)
- OpenAgentSkill's resolve API as a pre-filter (it already does task→skill matching)

## Commands
- `nerv loadout` — scan sources, vet, score, present recommendations
- `nerv loadout search <query>` — targeted search across all sources
- `nerv loadout install <source>/<skill>` — install with audit confirmation
- `nerv loadout audit` — re-vet installed skills against latest audit data
- `nerv loadout sources` — list configured registries and their status
- `nerv loadout diff` — compare installed skills vs. available (what's new)

## Architecture
```
nerv loadout
  ├── sources/           # registry adapters (skills-sh.ts, openagentskill.ts, local.ts)
  ├── vetting/           # security gates (audit-check.ts, laya-guard.ts)
  ├── scoring/           # relevance scoring via Laya (batch)
  └── decisions/
      └── skill-relevance.json   # Laya decision definition
```

## Open questions
- skills.sh API auth: Vercel OIDC required. Workaround options: CLI `npx skills search`, scrape, or deploy tiny Vercel proxy
- How to measure "recent work patterns" for relevance scoring — radar items? Last N prompts? Git activity? Installed skill gaps?
- Cache strategy for registry data (don't re-fetch on every run)
- OpenAgentSkill resolve API: verify it works for Claude Code specifically (tested with `agent=codex`)
