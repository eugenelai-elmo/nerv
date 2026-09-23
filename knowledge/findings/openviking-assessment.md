---
topic: OpenViking — worth activating?
date: 2026-09-23
type: spike
verdict: defer — activate when context bloat becomes measurable, not speculatively
---

## Status

Actively maintained. v0.4.21 released 20 Sep 2026, repo updated 22 Sep 2026, 38.4k stars, 694 open issues. Not abandoned.

## Claude Code Compatibility

First-party Claude Code plugin exists at `examples/claude-code-memory-plugin/`. Install via marketplace:
`claude plugin marketplace add https://raw.githubusercontent.com/volcengine/OpenViking/main/.claude-plugin/marketplace.json`

Known issue: #5224 — Helper Agent Access hardcodes a legacy plugin id (`claude-code-memory-plugin@openviking-plugins-local`), causing install failures. The fix uses `openviking-memory@openviking` instead. This was resolved in a July 2026 update.

Plugin works via stdio MCP proxy + HTTP hooks. Creates a persistent OpenViking session on first contact, reused for the entire Claude Code session.

## Token Savings

Benchmarks report 34–91% input token reduction depending on workload and retrieval policy. Real-world blog posts claim ~82% daily token cost reduction. OpenViking's own benchmarks report 75–85% at larger scales.

**For NERV specifically (~37 TS files, ~4160 lines):** savings would be modest. The tiered L0/L1/L2 retrieval is most valuable when you have hundreds of files and the agent wastes tokens loading irrelevant ones. NERV's filesystem-fallback already implements the same L0/L1/L2 tier logic (frontmatter→30 lines→full) with local file reads at <5ms. OpenViking adds a network hop for the same tier logic.

## Provider Assessment

`providers/openviking.ts` is a clean implementation: maps recall/save/list to REST endpoints with `viking://` URI prefixing. It would work if OpenViking were running. The provider is config-switchable (change `providers.json` memory section from `filesystem-fallback` to `openviking`).

## Verdict: Defer

- NERV is 37 files / 4160 lines — too small for OpenViking's tiered RAG to outperform direct file reads
- Filesystem-fallback already does L0/L1/L2 truncation at microsecond latency
- OpenViking's value scales with corpus size; at NERV's scale, it adds complexity and a server dependency for marginal gain
- The plugin install has had compatibility issues (#5224) — an unnecessary friction point
- **Activate when:** NERV grows past ~100 files, or when `npm run trace:stats` shows memory.recall latency >100ms, or when context window usage consistently exceeds 50% on routine prompts
