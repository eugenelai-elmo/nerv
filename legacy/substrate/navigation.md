<!-- substrate/navigation.md -->
# Code Navigation

## Rule: Never Read a Full File to Find One Thing

Before reaching for `Read`, ask: do I know the symbol name?

## Decision Tree

```
Do I know the symbol name?
  YES → find_symbol(name, include_body=false) to locate, then include_body=true to read
  NO, but I know the file → get_symbols_overview(file) to see all symbols
  NO symbol name, need pattern → search_for_pattern(regex)
  Need call chain / who uses this → find_referencing_symbols(symbol)
  None of the above → Read the file (last resort only)
```

## Hard Rules

- Never grep the whole repo to find a class — use find_symbol
- Never re-read a file already in context — you already have it
- Never read 500 lines to find 10 — use symbol overview first

## Token Budget Check

Before any Read: "Can I get what I need from the symbol overview?" If yes — do that. Tokens spent on reading are irreversible.
