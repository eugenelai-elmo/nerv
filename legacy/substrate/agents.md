<!-- substrate/agents.md -->
# Agent Coordination

## Should I Use a Subagent? (Decision Gate)

```
Is the task independent (no shared state with current work)?
  NO → do it yourself
  YES → would it pollute my context window (large reads, research)?
    NO → do it yourself (single tool call overhead isn't worth it)
    YES → use a subagent
```

Also: use a subagent when you need 2+ tasks done in parallel.

## Git worktrees for isolation

Non-trivial features get a worktree:
```bash
git worktree add ~/Projects/<repo>-worktrees/<ISSUE-ID> -b <branch> origin/main
```

This isolates changes from the main working tree. The agent working in the worktree
can build, test, and commit without touching your current work.

## Work reconciliation

When multiple agents work in parallel:
1. Each agent works in its own worktree/branch
2. Reconciler agent reviews all outputs before merge
3. Conflicts resolved by the reconciler — never silently dropped
4. Main agent reviews reconciler output before committing

## Agent handoff

When handing off context to a subagent, provide:
- Specific task (not "help with X")
- Relevant file paths (not "look around")
- Expected output format
- What NOT to do (saves iteration)
