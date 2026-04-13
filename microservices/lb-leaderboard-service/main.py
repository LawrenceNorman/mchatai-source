"""
lb-leaderboard-service — FastAPI Cloud Run service
Phase CBS: Global leaderboards for mini-apps and games.

Deploy:
  gcloud run deploy lb-leaderboard-service \
    --source . \
    --project mchatai-2367e \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars GOOGLE_CLOUD_PROJECT=mchatai-2367e

Env:
  GOOGLE_CLOUD_PROJECT — Firebase project ID
  SCORE_MAX_PER_GAME   — Anti-cheat: reject scores above this (default: 1_000_000)
"""

import os
import time
from typing import Optional
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
import firebase_admin
from firebase_admin import credentials, firestore, auth

# ---------------------------------------------------------------------------
# App init
# ---------------------------------------------------------------------------

app = FastAPI(title="Leaderboard Service", version="1.0.0")

if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

SCORE_MAX = int(os.getenv("SCORE_MAX_PER_GAME", 1_000_000))

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ScoreSubmit(BaseModel):
    gameID: str = Field(..., min_length=1, max_length=128)
    score: float
    displayName: Optional[str] = Field(None, max_length=64)
    metadata: Optional[dict] = None
    contentType: str = "miniApp"
    scoreType: str = "highIsGood"   # highIsGood | lowIsGood
    scoreUnit: str = "points"

class ScoreEntry(BaseModel):
    rank: int
    uid: str
    displayName: str
    score: float
    platform: Optional[str] = None
    timestamp: float

class SubmitResult(BaseModel):
    rank: int
    totalPlayers: int
    personalBest: float
    percentile: float
    isPersonalBest: bool

class TopScoresResult(BaseModel):
    gameID: str
    boardName: str
    totalPlayers: int
    scoreType: str
    scoreUnit: str
    scores: list[ScoreEntry]

# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def verify_token(authorization: str) -> str:
    """Returns uid from Firebase ID token. Raises HTTPException on failure."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    id_token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = auth.verify_id_token(id_token)
        return decoded["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "lb-leaderboard-service", "version": "1.0.0"}


@app.post("/scores", response_model=SubmitResult)
def submit_score(body: ScoreSubmit, authorization: str = Header(...)):
    uid = verify_token(authorization)

    # Anti-cheat: reject implausible scores
    if abs(body.score) > SCORE_MAX:
        raise HTTPException(status_code=422, detail=f"Score exceeds maximum ({SCORE_MAX})")

    board_ref = db.collection("leaderboards").document(body.gameID)
    scores_col = board_ref.collection("scores")

    # Upsert board metadata (auto-create on first submit)
    board_ref.set({
        "gameID": body.gameID,
        "contentType": body.contentType,
        "scoreType": body.scoreType,
        "scoreUnit": body.scoreUnit,
        "boardName": body.gameID.replace("-", " ").replace("_", " ").title(),
        "updatedAt": time.time(),
    }, merge=True)

    # Fetch personal best
    existing_doc = scores_col.document(uid).get()
    personal_best = existing_doc.to_dict().get("score", None) if existing_doc.exists else None
    is_personal_best = False

    if personal_best is None:
        is_personal_best = True
    elif body.scoreType == "highIsGood" and body.score > personal_best:
        is_personal_best = True
    elif body.scoreType == "lowIsGood" and body.score < personal_best:
        is_personal_best = True

    # Only store if personal best (prevents score inflation)
    if is_personal_best:
        display_name = (body.displayName or "Player")[:64]
        scores_col.document(uid).set({
            "uid": uid,
            "displayName": display_name,
            "score": body.score,
            "metadata": body.metadata or {},
            "platform": "macOS",
            "timestamp": time.time(),
        })
        board_ref.update({"updatedAt": time.time()})

    # Calculate rank among all scores
    if body.scoreType == "highIsGood":
        better_count = scores_col.where("score", ">", body.score).count().get()
    else:
        better_count = scores_col.where("score", "<", body.score).count().get()

    total_players = scores_col.count().get()[0][0].value
    rank = better_count[0][0].value + 1
    percentile = round((1 - (rank - 1) / max(total_players, 1)) * 100, 1)

    return SubmitResult(
        rank=rank,
        totalPlayers=total_players,
        personalBest=body.score if is_personal_best else personal_best,
        percentile=percentile,
        isPersonalBest=is_personal_best,
    )


@app.get("/scores/{gameID}/top", response_model=TopScoresResult)
def get_top_scores(gameID: str, limit: int = 50, authorization: str = Header(...)):
    verify_token(authorization)  # must be authenticated, but no uid needed for read

    limit = min(max(limit, 1), 100)  # clamp 1-100

    board_ref = db.collection("leaderboards").document(gameID)
    board_doc = board_ref.get()
    if not board_doc.exists:
        raise HTTPException(status_code=404, detail=f"No leaderboard found for game: {gameID}")

    board = board_doc.to_dict()
    score_type = board.get("scoreType", "highIsGood")

    scores_col = board_ref.collection("scores")
    if score_type == "highIsGood":
        query = scores_col.order_by("score", direction=firestore.Query.DESCENDING).limit(limit)
    else:
        query = scores_col.order_by("score", direction=firestore.Query.ASCENDING).limit(limit)

    docs = query.stream()
    entries = []
    for rank, doc in enumerate(docs, start=1):
        d = doc.to_dict()
        entries.append(ScoreEntry(
            rank=rank,
            uid=d.get("uid", ""),
            displayName=d.get("displayName", "Player"),
            score=d.get("score", 0),
            platform=d.get("platform"),
            timestamp=d.get("timestamp", 0),
        ))

    total_count = scores_col.count().get()[0][0].value

    return TopScoresResult(
        gameID=gameID,
        boardName=board.get("boardName", gameID),
        totalPlayers=total_count,
        scoreType=score_type,
        scoreUnit=board.get("scoreUnit", "points"),
        scores=entries,
    )


@app.get("/scores/{gameID}/user/{uid}")
def get_user_score(gameID: str, uid: str, authorization: str = Header(...)):
    calling_uid = verify_token(authorization)
    # Users can only read their own score (or admin, not implemented here)
    if calling_uid != uid:
        raise HTTPException(status_code=403, detail="Cannot read another user's score")

    board_ref = db.collection("leaderboards").document(gameID)
    doc = board_ref.collection("scores").document(uid).get()
    if not doc.exists:
        return {"uid": uid, "gameID": gameID, "score": None, "rank": None}

    d = doc.to_dict()
    return {"uid": uid, "gameID": gameID, "score": d.get("score"), "displayName": d.get("displayName")}
