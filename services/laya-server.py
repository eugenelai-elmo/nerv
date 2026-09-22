"""
NERV v2 — Laya Scorer Service
Thin FastAPI wrapper around the Laya library.
Exposes a Jev-compatible /score endpoint on localhost:8421.

Usage:
  pip install laya fastapi uvicorn
  python services/laya-server.py
  # or: uvicorn services.laya-server:app --host 127.0.0.1 --port 8421
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

LAYA_MODEL = os.environ.get("LAYA_MODEL", "convaiinnovations/laya-typed-decisions")

# Laya import — deferred to startup so missing lib gives a clear error
laya_engine = None


class Question(BaseModel):
    type: str  # "choice" | "score" | "noul"
    instructions: str
    criteria: dict[str, str] | list[str] | None = None


class ScoreRequest(BaseModel):
    state: str
    questions: dict[str, Question]


class DimensionAnswer(BaseModel):
    type: str
    choice: str | None = None
    score: float | None = None
    noul: float | None = None
    probabilities: dict[str, float] = {}
    legend: dict[str, str] | None = None
    confidence: float = 0.0


class ScoreResponse(BaseModel):
    answers: dict[str, DimensionAnswer]
    latency_ms: int
    provider: str = "laya-local"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global laya_engine
    try:
        import laya as laya_lib
        import warnings
        warnings.filterwarnings("ignore", category=RuntimeWarning, module="laya")
        laya_engine = laya_lib.load(LAYA_MODEL)
        print(f"[laya-server] Model {LAYA_MODEL} preloaded and ready")
    except ImportError:
        print("[laya-server] ERROR: laya not installed. Run: pip install laya")
        raise
    except Exception as e:
        print(f"[laya-server] ERROR loading model: {e}")
        raise
    yield
    laya_engine = None


app = FastAPI(title="NERV Laya Scorer", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok" if laya_engine is not None else "degraded",
        "provider": "laya-local",
        "model_loaded": laya_engine is not None,
    }


@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest):
    if laya_engine is None:
        raise RuntimeError("Laya model not loaded")

    start = time.perf_counter()

    # Build Laya-native question dict
    laya_questions: dict[str, dict[str, Any]] = {}
    for name, q in req.questions.items():
        lq: dict[str, Any] = {"type": q.type, "instructions": q.instructions}
        if q.criteria is not None:
            lq["criteria"] = q.criteria
        laya_questions[name] = lq

    # Single forward pass via system_one — all dimensions scored together
    raw_result = laya_engine.system_one(state=req.state, questions=laya_questions)

    elapsed_ms = int((time.perf_counter() - start) * 1000)

    # Map Laya output to Jev-compatible answer shape
    answers: dict[str, DimensionAnswer] = {}
    raw_answers = raw_result.get("answers", {})

    for name, ans in raw_answers.items():
        q_type = req.questions[name].type
        da = DimensionAnswer(type=q_type)

        if q_type == "choice":
            da.choice = ans.get("choice", "unknown")
            da.probabilities = ans.get("probabilities", {})
            da.confidence = ans.get("confidence", 0.0)

        elif q_type == "score":
            da.score = float(ans.get("score", 0))
            da.probabilities = ans.get("probabilities", {})
            da.confidence = ans.get("confidence", 0.0)
            da.legend = ans.get("legend")

        elif q_type == "noul":
            da.noul = float(ans.get("noul", 0.0))
            da.confidence = ans.get("confidence", 0.0)

        answers[name] = da

    return ScoreResponse(answers=answers, latency_ms=elapsed_ms)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8421, log_level="info")
