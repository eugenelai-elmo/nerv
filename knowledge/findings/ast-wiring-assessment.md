---
topic: AST-based wiring check — what would it catch?
date: 2026-09-23
type: spike
verdict: not worth building now — grep catches the same bugs at this scale; revisit at ~100 files
---

## What the TS Compiler API Gives Us

`ts.createProgram` + `ts.getSourceFile` provides:
- Full import/export resolution (follows `../lib/memory.js` → actual file, handles re-exports)
- AST node walking (visit every function call, property access, import declaration)
- Type information (what type is this variable? what interface does this provider implement?)
- Declaration lookup (where is `recall()` defined? who calls it?)

For import tracing specifically: `ts.resolveModuleName()` resolves an import specifier to a file path, accounting for `paths` mappings, `moduleResolution`, and `.js`→`.ts` extension mapping.

## What It Would Catch That Grep Misses

| Scenario | Grep result | AST result |
|----------|-------------|------------|
| File imports `memory.ts` but never calls `recall()` or `save()` | Grep sees "memory" → false pass | AST sees unused import → correct warn |
| Hook calls `decide()` via a re-export through an intermediate module | Grep doesn't see "decide" in the hook file → false fail | AST follows the import chain → correct pass |
| A string literal contains "memory" in a comment or log message | Grep matches → false pass | AST ignores non-import contexts → correct |
| Dynamic import `await import(path)` where path is a variable | Grep can't resolve → miss | AST can flag dynamic imports as unresolvable → correct warn |

## Current Grep-Based Check Analysis

The Layer 7 wiring checks in `check-stack.ts` use three strategies:

1. **Hook audit** (line 400–436): reads `hooks/*.sh` and `hooks/*.ts`, matches filenames against `settings.json` commands. **False negative:** a hook wired via a variable or indirect path in settings.json. **False positive:** none likely — filename matching is direct.

2. **Layer 4 caller check** (line 458–473): greps hook files for "memory", "recall", "save(". **False positive:** a comment mentioning memory. **False negative:** an indirect caller (hook → helper → lib/memory.ts via re-export).

3. **Layer invocation trace** (line 498–): reads all hook file contents and pattern-matches for layer keywords. **False positive:** the word "decide" appearing in a non-import context. **False negative:** indirect layer access through a module that re-exports.

**In practice at current scale:** none of these false-positive/negative scenarios have actually occurred. The codebase is 37 files, direct imports, no re-exports, no dynamic imports. The grep checks catch real bugs (they correctly flagged Layer 4 as dead last session).

## Effort Estimate

Building an AST-based checker: ~150–200 lines of TypeScript using `ts.createProgram`. Half a day's work. It would:
1. Build the program from tsconfig.json
2. Walk each hook entry point's import graph
3. Report which lib/ modules are reachable and which exports are actually called
4. Flag unused imports and unreachable layers

## Verdict: Not Worth Building Now

- 37 files, 4160 lines — grep catches the same bugs
- No re-exports, no dynamic imports, no intermediate modules — the patterns AST analysis catches don't exist in this codebase
- The trace logging (`npm run trace:stats`) provides **runtime** call graph data, which is strictly more informative than static analysis for catching real wiring issues
- **Revisit when:** the codebase exceeds ~100 files, or when provider resolution becomes indirect (e.g., a factory pattern or plugin loader), or when a grep check produces a confirmed false positive/negative
