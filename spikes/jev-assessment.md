# Jev Spike Assessment

**Date:** 2026-09-19  
**Status:** API shape confirmed, awaiting API key (waitlist)

## API Shape

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>

{
  "model": "jev-latest",
  "state": { ... },              // string | object | array — unstructured context
  "questions": {
    "<name>": {
      "type": "choice" | "score" | "noul",
      "instructions": "...",
      "criteria": { ... } | [...]  // map for choice, ordered array for score
    }
  }
}
```

Response returns `answers.<name>` with typed fields (`choice`/`score`/`noul`), `probabilities` distribution, and `confidence`. Usage reports input tokens only (output is free).

## Auth / Pricing

- Bearer token, keys via console.typesafe.ai
- **Currently waitlisted** (launched 15 Sep 2026). Keys reportedly arrive in 1–2 days.
- $0.042/M input tokens, output free. May decrease — company says price is subsidized.

## What Worked

- API shape is clean — state + questions in one call, typed answers back. Perfect for batch scoring.
- Score primitive with ordered criteria maps directly to our risk/value/urgency dimensions.
- Choice primitive handles categorical decisions (OKR alignment, customer impact type).
- Noul handles binary gates ("does this touch a user-facing flow?").
- Probabilities + confidence on every answer — better than a flat label.

## Blockers

- **API key required** — need to sign up at typesafe.ai and clear the waitlist.
- No TypeScript SDK yet? Docs mention Python and JS SDKs — need to confirm JS availability.
- Launched 4 days ago — stability / rate limits unknown at scale.

## Recommendation

**Start with sprint refinement** — it's a batch scoring problem (N tickets × 5 dimensions) that runs once per sprint, so rate limits and latency are not a concern. The proof-of-concept script (`jev-sprint-scorer.ts`) is ready to run once we have an API key.

`/eff:review` is the second integration — use Jev to risk-tier each changed file before the LLM reads it. Higher stakes (runs on every PR), so validate accuracy on sprint tickets first.

**Next step:** Sign up at typesafe.ai, get an API key, run the scorer against the 9 MOBFE S6 tickets, compare Jev scores to our hand-ranked refinement.
