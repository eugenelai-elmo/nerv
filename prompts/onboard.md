---
id: onboard
purpose: Read-only audit prompt for confirming AI Kernel onboarding in a host repo.
usage: |
  Open a Claude Code session in the host repo, then paste the prompt below.
  Or:  cat $AI_KERNEL_HOME/prompts/onboard.md | pbcopy
---

# AI Kernel — onboarding self-check (read-only)

Run an AI Kernel onboarding check for this repo. Report concisely.

1. Confirm kernel reachability:
   - $AI_KERNEL_HOME should be set (run: env | grep AI_KERNEL_HOME)
   - $AI_KERNEL_HOME/bin/ai-kernel-suggest must be executable

2. Resolve identity:
   - Repo namespace key: basename "$PWD"
   - Namespace dir: $AI_KERNEL_HOME/memory/repos/<key>/
   - Report whether the dir exists.

3. List kernel cards already available for this repo (scope=repo + scope=global):
   jq -r --arg r "$(basename "$PWD")" '
     .cards | to_entries[]
     | select(.value.scope == "global" or (.value.scope == "repo" and .value.repo == $r))
     | "\(.key) [\(.value.scope)] — \(.value.title)"
   ' "$AI_KERNEL_HOME/index.json"

4. Find in-repo shadow sources (legacy memory the kernel does NOT auto-import):
   - .serena/memories/ → list any *.md files
   - .ai/artifacts/   → list any *.md files
   - .ai/repo-intelligence.md if present

5. Run the deviation scanner:
   $AI_KERNEL_HOME/bin/ai-kernel-scan | jq '{count: (.deviations|length), kinds: ([.deviations[].kind] | unique)}'

6. Test the lazy retrieval path with a representative query:
   echo '{"hook_event_name":"UserPromptSubmit","prompt":"datetime convention"}' \
     | $AI_KERNEL_HOME/bin/ai-kernel-suggest --cc-prompt-hook

7. Summarize as:
   - Kernel reachable: yes/no
   - Repo namespace exists: yes/no
   - Existing cards: <N> (list ids)
   - Shadow sources found: <list with paths and counts>
   - Deviations: <N> (kinds)
   - Lazy retrieval working: yes/no (sample output)
   - Recommended next step: (e.g., "migrate 3 high-value Serena memories", "no action needed")

Do not migrate anything yet — this is a read-only audit.
