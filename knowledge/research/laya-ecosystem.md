---
topic: Laya ecosystem
source: session-handoff
date: 2026-09-22
---

- Three checkpoints: `laya` (base), `laya-multilingual`, `laya-typed-decisions` (we use this)
- `RLAgent` — RL-trained variant, better calibration
- `Router` class — auto-detects language, dispatches to optimal checkpoint
- Built-in presets: `guard_questions()` (prompt injection), `moderation_questions()`, `router_questions()` (LLM routing), `triage_questions()`
- Fine-tuning supported — notebook exists. Our weak risk-gate accuracy on base model is expected; fine-tuning on NERV decision history would fix it
- 11.5k stars, Apache 2.0
