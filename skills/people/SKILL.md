---
name: people
description: Bring up a profile of one of Eugene's reports or team members — Bloom appraisal (goals, career, IDP, final review), recent GitHub delivery signals, and open Jira work — as a 1:1-ready brief. Triggers on "/people <name>", "bring up <name>'s profile", "profile for <name>", "how is <name> tracking", "<name>'s goals/IDP".
---

# People profile

The roster and Bloom access live in the `nerv people` CLI. This skill holds **no roster and no command list** — learn the grammar from the CLI.

## Steps

1. **Learn the CLI** (once per session): `nerv people --help`.
2. **Resolve the person:** `nerv people resolve "<query>" --json`.
   - Exit 2 → show the candidates and ask which one. Never guess.
   - Exit 3 → the roster is missing/invalid; relay the message and stop.
3. **Gather in parallel:**
   - **Appraisal:** `nerv people appraisal <id> --json` (add `--section <s>` if the user asked about one area only).
   - **GitHub** (only if `person.github` is set): follow the *Data collection* and *Sections to render* steps of `~/Projects/nerv/.claude/skills/dev-radar.md` for that login, default 14d. Skip the dev-radar roster — use `person.github`.
   - **Jira** (only if `person.jira` is set): load `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` via ToolSearch, cloudId `c44f2b4b-ca23-46e4-883b-3f7f5e2de9fd`, JQL `assignee = "<person.jira>" AND resolution = Unresolved ORDER BY updated DESC`, fields `["summary","status","priority","updated","issuetype"]`, maxResults 15.
4. **Write the profile** (shape below).
5. **Source status:** for every source that was not `ok` or was skipped, say so in one line with its `hint`. If a hint starts with `interactive:`, tell the user to run the quoted command (e.g. `! nerv people login`) and continue with the remaining sources.

## Profile shape

```
## <Name> — profile (<today>)

**Appraisal (<FY>, <progressStatus>)**
- Goals: <1–3 line summary of their stated goals, or "not filled in">
- Career: aspirations / strengths / development areas — one line each
- IDP: <each item title → actions>
- Final review: <status or "not started">

**Delivery (last 14d)** — <dev-radar headline metrics + traffic lights>

**Current work** — <Jira in-progress / unresolved, top 5>

**Threads to pull in a 1:1**
- <connect appraisal goals/IDP to what the delivery and Jira data show — e.g. an IDP item with no matching work, a goal visibly progressing>

_Sources: bloom ✓ · github ✓ · jira ✓_  (✗ + hint for any that failed)
```

Quote appraisal text sparingly — summarise. Don't invent ratings or judgements the data doesn't support.

## Privacy

Appraisal content stays in this terminal conversation. Do not put it into Artifacts, Glean, Slack drafts, Confluence, Jira, or NERV/auto memory unless the user explicitly asks in that turn. Never print or log the Bloom session cookie.
