---
name: sitrep
description: Morning briefing or mid-day catch-up. Synthesizes radar, inbox, handoff, git, PRs, and prod health into one prioritized view. Context-sensitive — adapts based on time of day and session state.
---

# Sitrep — Daily Driver

Synthesizes everything an engineering leader needs into one view. Not a deep
dive (that's command-centre) — this is "what should I do right now."

Triggers: "sitrep", "what now", "catch me up", "what should I do", "morning",
"what's on my plate", "where are we at", "priorities".

## Context Detection

Determine the mode from time of day and session state:

```bash
HOUR=$(date +%H)
HANDOFF="$HOME/.claude/handoff/session-handoff.md"
RADAR_DIR="$HOME/.claude/handoff/radar"
INBOX="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/eugenes_vault/1_Areas/👹 Work_ELMO/2_Areas/📥 ELMO Inbox.md"
LAST_ACTION="$HOME/.claude/state/last-action.txt"
CMD_CENTRE="$HOME/Projects/command-centre"
```

| Condition | Mode | Focus |
|-----------|------|-------|
| Hour < 11 AND handoff exists | **morning** | Full briefing: restore + radar + inbox + overnight changes + prod pulse |
| Hour < 11 AND no handoff | **morning-fresh** | Radar + inbox + overnight changes + prod pulse (no restore) |
| Hour >= 11 | **mid-day** | Quick catch-up: radar delta + near-urgent + prod pulse |
| User says "quick" or "fast" | **flash** | Radar + top 3 priorities only, no external queries |

## Data Sources

Read in this order. Skip gracefully if unavailable.

### 1. Handoff (morning only)
```
$HOME/.claude/handoff/session-handoff.md
```
Extract: Goal, Branch, Current state, Next steps. One paragraph summary.
If handoff is from today, skip (already in this session).

### 2. Radar + Capacity (always)
```
$HOME/.claude/handoff/radar/*.yml
```
Read all `.yml` files. For each:
- Extract `id`, `status`, `summary`, `next_step`, `since`, `waiting_on`
- Calculate age from `since` field
- **Classify thread type** from the item's shape:
  - **Builder** — Eugene is writing code or producing an artifact (deep focus)
  - **Shepherd** — Eugene steers others' work (reviews, unblocks, coordinates)
  - **Closer** — needs one focused session to finish or park
  - **Watcher** — blocked on someone else, nothing Eugene can do right now
- **Capacity check** against budget: 1 builder + 2 shepherds + 1 closer
  rotating. Watchers are free *only if parked*. If active watchers sit in
  radar without `waiting_on` or `status: waiting`, they're mislabelled —
  either they're actually dropping or they should be parked.
- **Health signals per item:**
  - **Dropping** (>7d no touch, no `waiting_on`) — Eugene stopped engaging.
    Action: re-engage or park.
  - **Blocked** (has `waiting_on`) — someone else hasn't responded.
    Action: chase (if >7d) or wait (if <7d).
  - **Stale** (>14d) — age badge, but the *type* matters more than the age.
- Sort: over-budget items first, then dropping, then blocked, then active.

Cross-reference with the `=== RADAR ===` block in session context (injected
by hook) — the session block may be more current than the files if another
session updated it.

### 3. Inbox Priority (always)
```
$INBOX
```
Read these sections only (don't load the full file):
- `## 💡 Suggested Actions` — top 5 agent-maintained priorities
- `## ⏳ Waiting on Me` — items Eugene owes, with aging indicators
- `## 📡 Comms Out` — comms owed to others

Count items by aging: 🔴 (overdue), 🟡 (aging), 🟢 (fresh).

### 4. Overnight Changes (morning only)
```bash
# Recent master commits
git -C ~/Projects/elmo-application log --oneline --since="yesterday" origin/master | head -10

# PRs merged overnight
source ~/Projects/elmo-application/.env.local
curl -s -u "$BB_EMAIL:$BB_TOKEN" \
  "https://api.bitbucket.org/2.0/repositories/elmodevelopment/elmo-application/pullrequests?state=MERGED&pagelen=10" \
  | python3 -c "
import json, sys
from datetime import datetime, timedelta, timezone
cutoff = datetime.now(timezone.utc) - timedelta(hours=16)
for pr in json.load(sys.stdin).get('values', []):
    updated = datetime.fromisoformat(pr['updated_on'].replace('Z', '+00:00'))
    if updated > cutoff:
        print(f'  #{pr[\"id\"]} {pr[\"title\"][:60]} (by {pr[\"author\"][\"display_name\"]})')
"
```

### 5. Prod Pulse (always, fast queries only)
```bash
# Error rate last 24h vs same weekday last week
source ~/Projects/command-centre/.env.local 2>/dev/null || source ~/Projects/elmo-application/.env.local
curl -sk -H "Authorization: ApiKey $ES_API_KEY" -H "Content-Type: application/json" \
  "$ES_URL/logs-apm.error-default/_search" -d '{
  "size":0,
  "query":{"bool":{"filter":[{"term":{"service.name":"SPA - Frontend"}},{"range":{"@timestamp":{"gte":"now-24h"}}}]}},
  "aggs":{
    "total":{"value_count":{"field":"@timestamp"}},
    "by_source":{"terms":{"field":"labels.error_source","size":5}},
    "affected_users":{"cardinality":{"field":"labels.security_user"}}
  }
}'
```
Only report if: error count is >2x same-weekday baseline, new error types
appeared, or MF-specific errors (`share_scope_mismatch`, `mf_integrity`)
are non-zero. If all quiet, say "Prod clear" and move on.

### 6. Vendor / Security Alerts (always, via Glean)
Query Glean for recent vendor security notifications hitting Gmail and Slack.

Gmail (vendor emails — action required, SDK updates, security notices):
```
mcp__glean_default__search:
  query: "SDK action required update security"
  app: gmailnative
  sort_by_recency: true
  _user_goal: "check for vendor security/update alerts in Gmail"
```
Slack (Dependabot security PRs, vulnerability notices):
```
mcp__glean_default__search:
  query: "security vulnerability SDK update"
  app: slack
  sort_by_recency: true
  num_results: 5
  _user_goal: "check for security alerts in Slack"
```
Only report if something new (< 7 days) surfaces. Flag it prominently — vendor
security issues (compromised SDKs, forced upgrades, CVEs) can block releases.

### 7. Team Throughput (morning only, via GitHub API)
Pull merged PR stats for the team's repos using `gh pr list`. Quick, no vendor dependency.
```bash
# MOBFE — Frontend + Mobile repos, last 7 days
SINCE=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d)

echo "=== Frontend ==="
gh pr list --repo elmo-software/elmo-frontend --state merged --limit 100 \
  --json author,mergedAt,createdAt \
  --jq "[.[] | select(.mergedAt > \"${SINCE}\")] | group_by(.author.login) | .[] | {
    author: .[0].author.login,
    prs: length,
    avg_cycle_h: (([.[] | (((.mergedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) / 3600)] | add) / length | floor)
  }"

echo "=== Mobile ==="
gh pr list --repo elmo-software/elmo-mobile-app --state merged --limit 100 \
  --json author,mergedAt,createdAt \
  --jq "[.[] | select(.mergedAt > \"${SINCE}\")] | group_by(.author.login) | .[] | {
    author: .[0].author.login,
    prs: length,
    avg_cycle_h: (([.[] | (((.mergedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) / 3600)] | add) / length | floor)
  }"
```
Filter to MOBFE team members only (Jayz, Glev, Hai, Ola, Ralph, Eugene).
Report a compact table: name, PR count, avg cycle time.

**Interpret the numbers — don't just report them.** Eugene is a new manager;
the sitrep should surface the management action, not leave him to figure it out:

- **0 PRs this week** → "Ola: 0 PRs — on MF discovery (expected) or blocked?
  Check in at next 1:1."
- **Cycle time > 48h** → "Jayz: avg 52h — likely review wait, not coding.
  Are PRs sitting without reviewers? Consider pairing review assignments."
- **High volume + low cycle** → "Hai: 6 PRs, 8h avg — strong. Acknowledge it."
- **Sudden drop from prior week** → "Glev: 1 PR (was 5 last week) — context
  switch? Pulled to incident? Worth a check-in."
- **Someone not on the team showing up** → external contributor, note it.

The insight matters more than the number. Frame each flag as a 1:1 topic
or a process question, not a performance judgment. Keep it to 3-5 lines
max in the sitrep — only the flags, not the full table (full table on
request via `/throughput`).

### 8. 1:1 Prep (morning only, via Glean calendar)
Check today's calendar for 1:1s with direct reports via Glean:
```
mcp__glean_default__search:
  query: "1:1"
  app: googlecalendar
  _user_goal: "find today's 1:1 meetings for prep"
```
Also search for the person's name — they might not title it "1:1".
For each 1:1 found today, auto-generate 2-3 talking points by cross-referencing:
- **Throughput** (from step 7): any flags for this person?
- **Radar**: are they the owner/feature-lead on any active item?
- **Recent PRs**: anything notable merged or stuck?
- **Inbox "waiting on me"**: anything Eugene owes them?

Output format:
```
**1:1 with Hai (2:30pm):**
- Throughput: 9 PRs, 12h cycle — strong. Acknowledge.
- Pendo SDK bump (LMS-1270) — assigned to him, confirm he's seen it.
- Payslips: is he being pulled for too many PR reviews?
```
Keep it to 2-3 bullets per person. Only generate for today's 1:1s.
If no 1:1s today, skip silently.

### 9. Stale Dependencies (always)
Scan radar items with `waiting_on` set. For each:
- Calculate days since `last_updated` or `since`
- If >7 days with no movement → flag as **"chase needed"** with the person's name
- If >14 days → flag as **"escalate or park"**

Also check Jira for tickets assigned to other teams that block your work:
```bash
# Quick check — are any blocking tickets still open?
gh pr list --repo elmo-software/elmo-frontend --state open --json author,title,createdAt \
  --jq '[.[] | select((.createdAt | fromdateiso8601) < (now - 7*86400))] | length'
```
Frame as: "You've been waiting on [person] for [N] days about [thing].
Options: chase now, escalate to their manager, or park it."

### 10. Open Review Requests (morning only)
Check if any team member has PRs waiting for review >24h:
```bash
gh pr list --repo elmo-software/elmo-frontend --state open --limit 20 \
  --json author,title,createdAt,reviewRequests \
  --jq '[.[] | select(.reviewRequests | length > 0) |
    select((.createdAt | fromdateiso8601) < (now - 86400)) |
    {title: .title[:50], author: .author.login, age_h: (((now - (.createdAt | fromdateiso8601)) / 3600) | floor), reviewers: [.reviewRequests[].login]}]'
```
Flag PRs where a MOBFE team member is a requested reviewer and hasn't reviewed.
Management action: "Jayz has 2 PRs waiting for his review (>24h). Is he aware?"
Also flag if a team member's OWN PR has been waiting >24h with no reviews —
that's the review-wait cycle time issue to address.

### 11. Week-over-Week Comparison (morning only)
After computing throughput (step 7), compare with stored prior-week data:
```
$HOME/.claude/state/throughput-last-week.json
```
On each morning sitrep run, after reporting, save current week's data to this file.
Next week's run reads it and reports deltas:
- "Jayz: 9 PRs (was 5 last week, +80%)"
- "Ola: 2 PRs (was 6 last week, -67% — expected, shifted to MF discovery)"

Only report meaningful changes (>30% swing either direction).
If no prior-week file exists, skip comparison and just save current data.

### 12. Near-Urgent (always)
Scan radar + inbox for items with deadlines in the next 48 hours:
- Radar items with dates in `next_step` (e.g., "25 Aug follow-up")
- Inbox items mentioning specific dates
- Contract freezes, meeting prep, PR review deadlines

### 13. Last Action (context)
```
$HOME/.claude/state/last-action.txt
```
One line — what the last session did. Helps orient "you were just doing X."

## Output Format

### Morning

```
## Sitrep — [date] morning

**Yesterday:** [1-2 lines from handoff — what you were doing, where you left off]

**Overnight:** [merged PRs, master commits, or "quiet night"]

**Capacity: [N]/3 active | [type breakdown]**
[one-line verdict: "on budget", "over by 1 — what parks?", "room for a closer"]

**Radar:**
- [type badge] [summary] — [next_step] [health signal]
- ...

**Closer queue:** [item that could be finished/parked this week in one session, or "clear"]

**Today's priorities:**
1. [highest priority item with source: radar/inbox/deadline]
2. [second priority]
3. [third priority]

**Waiting on others:** [count] items ([names if <4])

**Prod:** [one line — clear, or the signal]

**Vendor alerts:** [any SDK/security emails or Slack notices < 7d, or "clear"]

**Team throughput (7d):**
| Name | PRs | Cycle | Flag |
[only rows with a flag — strong, slow, dropped, zero]

**Open reviews:** [team PRs waiting >24h for review, or "clear"]

**1:1 prep:** [if any 1:1s today, 2-3 bullets per person]

**Stale deps:** [chase needed / escalate, or "none"]

**Dropping (>7d no touch):** [list if any — these need re-engage or park]
```

### Mid-day

```
## Catch-up — [date] [time]

**Capacity: [N]/3 active | [type breakdown]**

**Since last check:** [what moved — merged PRs, radar updates from other sessions]

**Near-urgent:** [items with deadlines <48h]

**Radar:**
- [only items that changed or need attention]
- [flag any item that shifted health: was active → now dropping]

**Closer queue:** [if a closer is ready to finish, name it]

**Next:** [single most impactful thing to do right now]

**Prod:** [one line]
```

### Flash

```
## Flash — [date]
1. [top priority]
2. [second priority]
3. [third priority]
Prod: [one line]
```

## Rules

- **Synthesize, don't dump.** Radar + inbox + handoff produce overlapping items.
  Deduplicate. If radar says "payslips contract freeze 28 Aug" and inbox says
  "payslips ways of working session", that's one item, not two.
- **Rank across sources.** A radar item with a deadline tomorrow beats an inbox
  item that's been overdue for 30 days. Time-sensitivity > age.
- **Quiet when quiet.** If prod is fine, one line. If no overnight changes, skip
  the section. Don't pad.
- **Dropping ≠ blocked ≠ stale.** Three different health signals, three
  different actions:
  - *Dropping* (>7d, no `waiting_on`): Eugene stopped touching it. Action:
    re-engage or park. Surface prominently — this is the burnout leak.
  - *Blocked* (`waiting_on` set): someone else hasn't responded. Action:
    chase if >7d, wait if <7d. Low cognitive cost if acknowledged.
  - *Stale* (>14d): age badge. Context for "should I close this?", not
    "do this now." List at the bottom.
- **Capacity is a budget, not a count.** 1 builder + 2 shepherds + 1
  rotating closer. Watchers are free only when formally parked (yml in
  parked/). An active watcher with no `waiting_on` is mislabelled —
  surface it as "what is this actually?"
- **Closer queue: one per week.** Each sitrep names the single radar item
  closest to done/parkable. Finishing it clears a slot. Don't carry two
  closers — that's just two more active threads.
- **Never fabricate prod data.** If ES is unreachable, say so. Don't guess.
- **Cross-session awareness.** The radar block in session context may differ from
  the files on disk — another session may have updated the files. Trust the
  files (they're the source of truth), but note if the session block shows
  different `next_step` values (means another session made progress).

## Integration with Other Skills

- **`/inbox`** — sitrep reads inbox sections but never writes to them. Use
  `/inbox add` to capture, `/inbox rewrite` to reconcile.
- **Command centre** — sitrep uses the same `.env.local` and ES queries but
  runs only the fast ones (error rate, MF breakdown). For deep dives:
  `cd ~/Projects/command-centre && claude` then "morning digest" or "tech health".
- **Radar** — sitrep reads radar items. Radar reconcile hook updates them on
  session Stop. Sitrep never writes to radar files.
- **Handoff** — sitrep reads the handoff file for morning context. `/handoff`
  skill writes it. PreCompact hook auto-triggers it.
