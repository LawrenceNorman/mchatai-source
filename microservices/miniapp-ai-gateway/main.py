"""
miniapp-ai-gateway — FastAPI Cloud Run service
Phase CBS: Token-metered AI gateway for mini-apps.

Endpoints:
  POST /generate        — General LLM generation (chess moves, story, quiz generation)
  POST /hint            — Puzzle/game hints (lower token cost)
  POST /opponent-move   — Board game AI move (chess FEN → UCI move)
  GET  /availability    — Check token balance + availability for a user
  GET  /health

Token deduction happens in a Firestore transaction before the LLM call.
If balance < cost, returns 402 Payment Required with upgrade URL.

Deploy:
  gcloud run deploy miniapp-ai-gateway \
    --source . \
    --project mchatai-2367e \
    --region us-central1 \
    --set-env-vars ANTHROPIC_API_KEY=<key>,GOOGLE_CLOUD_PROJECT=mchatai-2367e
"""

import os
import time
from typing import Optional
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
import firebase_admin
from firebase_admin import credentials, firestore, auth
import anthropic

# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

app = FastAPI(title="Mini-App AI Gateway", version="1.0.0")

if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()
anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

UPGRADE_URL = "https://mchatai.com/cloud"

# Default token costs per request type
TOKEN_COST = {
    "generate": 1.0,
    "hint": 0.5,
    "opponent-move": 1.0,
}

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    system: Optional[str] = Field(None, max_length=1000)
    maxTokens: int = Field(1024, ge=64, le=4000)
    temperature: float = Field(0.4, ge=0.0, le=1.0)
    costTokens: float = Field(1.0, ge=0.1, le=10.0)
    gameID: Optional[str] = None

class HintRequest(BaseModel):
    context: str = Field(..., max_length=2000)
    hintType: str = "general"   # general | next-move | explanation
    costTokens: float = Field(0.5, ge=0.1, le=5.0)
    gameID: Optional[str] = None

class OpponentMoveRequest(BaseModel):
    fen: str = Field(..., max_length=200)          # Chess FEN string
    gameType: str = "chess"                         # chess | checkers
    difficulty: str = "strong"                      # strong | expert
    costTokens: float = Field(1.0, ge=0.1, le=5.0)
    gameID: Optional[str] = None

# ---------------------------------------------------------------------------
# Token management
# ---------------------------------------------------------------------------

def verify_and_deduct(authorization: str, cost: float) -> str:
    """Verify Firebase ID token and deduct tokens atomically. Returns uid."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    id_token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = auth.verify_id_token(id_token)
        uid = decoded["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    user_ref = db.collection("users").document(uid)

    @firestore.transactional
    def deduct_in_transaction(transaction, user_ref, cost):
        snapshot = user_ref.get(transaction=transaction)
        if not snapshot.exists:
            raise HTTPException(status_code=402, detail=f"No compute token balance. Purchase at {UPGRADE_URL}")
        data = snapshot.to_dict()
        balance = data.get("computeTokenBalance", 0.0)
        if balance < cost:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient tokens ({balance:.1f} < {cost}). Purchase more at {UPGRADE_URL}"
            )
        transaction.update(user_ref, {"computeTokenBalance": balance - cost})
        return balance - cost

    transaction = db.transaction()
    deduct_in_transaction(transaction, user_ref, cost)
    return uid

# ---------------------------------------------------------------------------
# LLM helper
# ---------------------------------------------------------------------------

def call_claude(prompt: str, system: Optional[str], max_tokens: int, temperature: float) -> str:
    system_str = system or "You are a helpful assistant embedded in a mini-app. Be concise."
    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",  # Fast + cheap for mini-app features
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_str,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "miniapp-ai-gateway", "version": "1.0.0"}


@app.get("/availability")
def check_availability(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    id_token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = auth.verify_id_token(id_token)
        uid = decoded["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    doc = db.collection("users").document(uid).get()
    balance = doc.to_dict().get("computeTokenBalance", 0.0) if doc.exists else 0.0
    return {
        "available": balance > 0,
        "balance": round(balance, 2),
        "upgradeURL": UPGRADE_URL if balance <= 0 else None,
    }


@app.post("/generate")
def generate(body: GenerateRequest, authorization: str = Header(...)):
    uid = verify_and_deduct(authorization, body.costTokens)
    text = call_claude(body.prompt, body.system, body.maxTokens, body.temperature)
    return {"text": text, "tokensUsed": body.costTokens, "uid": uid}


@app.post("/hint")
def hint(body: HintRequest, authorization: str = Header(...)):
    uid = verify_and_deduct(authorization, body.costTokens)
    system = "You are a helpful game assistant. Give a brief, useful hint without giving the full answer."
    prompt = f"Game context: {body.context}\nProvide a {body.hintType} hint in 1-2 sentences."
    text = call_claude(prompt, system, 256, 0.3)
    return {"hint": text, "tokensUsed": body.costTokens}


@app.post("/opponent-move")
def opponent_move(body: OpponentMoveRequest, authorization: str = Header(...)):
    uid = verify_and_deduct(authorization, body.costTokens)
    if body.gameType == "chess":
        system = "You are a chess engine. Respond with only a single UCI move (e.g., e2e4). No explanation."
        prompt = f"Chess position (FEN): {body.fen}\nDifficulty: {body.difficulty}. Best move:"
        text = call_claude(prompt, system, 16, 0.1)
        # Extract move: take first token-like substring
        move = text.strip().split()[0] if text.strip() else "e2e4"
        return {"move": move, "gameType": "chess", "tokensUsed": body.costTokens}
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported gameType: {body.gameType}")
