"""qz-workflow-orchestrator — Executes composed AIAction DAGs with resilience."""

import os
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from engine import WorkflowEngine, WorkflowContext, configure_services
from workflows import WORKFLOW_REGISTRY

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Quiznect Workflow Orchestrator", version="1.0.0")

# ── Service URLs (configured via env vars or defaults) ──

DEFAULT_BASE = os.getenv("SERVICE_BASE_URL", "http://localhost:8080")

configure_services({
    "qz-topic-validator": os.getenv("QZ_TOPIC_VALIDATOR_URL", f"{DEFAULT_BASE}"),
    "qz-quiz-generator": os.getenv("QZ_QUIZ_GENERATOR_URL", f"{DEFAULT_BASE}"),
    "qz-question-quality": os.getenv("QZ_QUESTION_QUALITY_URL", f"{DEFAULT_BASE}"),
    "qz-metadata": os.getenv("QZ_METADATA_URL", f"{DEFAULT_BASE}"),
    "qz-podcast": os.getenv("QZ_PODCAST_URL", f"{DEFAULT_BASE}"),
    "qz-visual": os.getenv("QZ_VISUAL_URL", f"{DEFAULT_BASE}"),
    "qz-media-processing": os.getenv("QZ_MEDIA_PROCESSING_URL", f"{DEFAULT_BASE}"),
})


# ── Firestore Checkpoint Store (optional) ──

class FirestoreCheckpointStore:
    """Saves/loads step results to Firestore for crash recovery."""

    def __init__(self):
        try:
            from google.cloud import firestore
            self.db = firestore.AsyncClient()
            self.enabled = True
        except Exception:
            self.db = None
            self.enabled = False
            logger.warning("Firestore not available — checkpoints will be in-memory only")

    async def save(self, job_id: str, step_name: str, result):
        if not self.enabled:
            return
        doc_ref = self.db.collection("workflow_checkpoints").document(job_id).collection("steps").document(step_name)
        await doc_ref.set({
            "status": result.status.value,
            "data": json.dumps(result.data) if result.data else None,
            "error": result.error,
            "tokens_used": result.tokens_used,
            "duration_ms": result.duration_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })

    async def load(self, job_id: str) -> dict:
        if not self.enabled:
            return {}
        from engine import StepResult, StepStatus
        checkpoints = {}
        docs = self.db.collection("workflow_checkpoints").document(job_id).collection("steps").stream()
        async for doc in docs:
            d = doc.to_dict()
            checkpoints[doc.id] = StepResult(
                status=StepStatus(d.get("status", "failed")),
                data=json.loads(d["data"]) if d.get("data") else None,
                error=d.get("error", ""),
                tokens_used=d.get("tokens_used", 0),
                duration_ms=d.get("duration_ms", 0),
            )
        return checkpoints

    async def update_job_status(self, user_id: str, job_id: str, updates: dict):
        if not self.enabled:
            return
        doc_ref = self.db.collection("users").document(user_id).collection("cloudActionResults").document(job_id)
        updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
        await doc_ref.update(updates)


checkpoint_store = FirestoreCheckpointStore()
engine = WorkflowEngine(checkpoint_store=checkpoint_store if checkpoint_store.enabled else None)


# ── Models ──

class ExecuteInput(BaseModel):
    action_id: str = Field(..., description="The workflow action ID, e.g. quiznect_make_quiz")
    job_id: str = Field(default="", description="Job ID (generated if empty)")
    user_id: str = Field(default="", description="User ID for Firestore updates")
    input: dict = Field(default={}, description="Workflow input data")
    config: dict = Field(default={}, description="Workflow config (e.g. voice selection)")
    tokens_budget: float = Field(default=50.0, ge=0.1, le=1000.0)
    resume: bool = Field(default=False, description="Resume from checkpoints if available")

class ExecuteOutput(BaseModel):
    job_id: str
    status: str
    action_id: str
    tokens_consumed: float
    result: dict | None = None
    warnings: list[str] = []
    steps_completed: int = 0
    steps_total: int = 0

class ListWorkflowsOutput(BaseModel):
    workflows: list[dict]


# ── Endpoints ──

@app.get("/workflows", response_model=ListWorkflowsOutput)
async def list_workflows():
    """List all available workflow actions."""
    return ListWorkflowsOutput(
        workflows=[
            {
                "action_id": aid,
                "description": w["description"],
                "estimated_tokens": w["estimated_tokens"],
                "steps_count": len(w["steps"]),
            }
            for aid, w in WORKFLOW_REGISTRY.items()
        ]
    )


@app.post("/execute", response_model=ExecuteOutput)
async def execute_workflow(body: ExecuteInput):
    """Execute a workflow action (main entry point, called by compute-proxy)."""
    workflow = WORKFLOW_REGISTRY.get(body.action_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Unknown action: {body.action_id}")

    job_id = body.job_id or str(uuid.uuid4())
    steps = workflow["steps"]

    # Load checkpoints for resume
    checkpoints = {}
    if body.resume and checkpoint_store.enabled:
        checkpoints = await checkpoint_store.load(job_id)
        if checkpoints:
            logger.info(f"Resuming job {job_id} with {len(checkpoints)} checkpoints")

    ctx = WorkflowContext(
        job_id=job_id,
        user_id=body.user_id,
        input=body.input,
        config=body.config,
        tokens_budget=body.tokens_budget,
        checkpoints=checkpoints,
    )

    # Progress callback to update Firestore job status
    async def on_progress(step_name, completed, total, status):
        if checkpoint_store.enabled and body.user_id:
            await checkpoint_store.update_job_status(body.user_id, job_id, {
                "status": "running" if status in ("complete", "skipped") else status,
                "progress": completed / total if total > 0 else 0,
                "currentStep": step_name,
                "completedSteps": completed,
                "totalSteps": total,
                "tokensConsumed": ctx.tokens_consumed,
            })

    # Update job status to running
    if checkpoint_store.enabled and body.user_id:
        await checkpoint_store.update_job_status(body.user_id, job_id, {
            "status": "running",
            "totalSteps": len(steps),
        })

    # Execute
    ctx = await engine.execute(steps, ctx, progress_callback=on_progress)

    # Determine final status
    completed_count = sum(1 for v in ctx.checkpoints.values() if v.status.value in ("complete", "skipped"))
    all_done = completed_count >= len(steps)

    if all_done:
        status = "complete"
    elif any(v.status.value == "failed" for v in ctx.checkpoints.values()):
        status = "failed"
    else:
        status = "paused_insufficient_tokens"

    # Get final result from last step
    last_step_name = steps[-1].name if steps else ""
    final_result = ctx.results.get(last_step_name)

    # Update Firestore with final status
    if checkpoint_store.enabled and body.user_id:
        update = {
            "status": status,
            "tokensConsumed": ctx.tokens_consumed,
            "progress": 1.0 if status == "complete" else completed_count / len(steps),
            "completedSteps": completed_count,
            "warnings": ctx.warnings,
        }
        if final_result:
            update["result"] = final_result
        if status == "complete":
            update["completedAt"] = datetime.now(timezone.utc).isoformat()
        await checkpoint_store.update_job_status(body.user_id, job_id, update)

    return ExecuteOutput(
        job_id=job_id,
        status=status,
        action_id=body.action_id,
        tokens_consumed=round(ctx.tokens_consumed, 2),
        result=final_result,
        warnings=ctx.warnings,
        steps_completed=completed_count,
        steps_total=len(steps),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "workflows": len(WORKFLOW_REGISTRY)}
