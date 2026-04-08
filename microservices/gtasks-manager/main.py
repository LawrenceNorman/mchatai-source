"""Google Tasks Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import json
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class TaskListsOutput(BaseModel):
    task_lists: List[Dict[str, Any]]

class TasksOutput(BaseModel):
    tasks: List[Dict[str, Any]]

class CreateTaskInput(BaseModel):
    title: str = Field(..., description="Task title")
    notes: Optional[str] = None
    due: Optional[str] = Field(None, description="Due date (RFC 3339)")
    tasklist: Optional[str] = Field(None, description="Task list ID (default: primary)")

class OperationOutput(BaseModel):
    success: bool
    message: str


# ── Helpers ──

def run_gws(args: List[str], timeout: int = 30) -> Any:
    cmd = ["gws"] + args + ["--format=json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)
        if result.returncode != 0:
            error = result.stderr.strip() or result.stdout.strip()
            raise HTTPException(status_code=500, detail=f"gws failed: {error[:300]}")
        stdout = result.stdout.strip()
        if stdout:
            try:
                return json.loads(stdout)
            except json.JSONDecodeError:
                return [{"raw": line} for line in stdout.split("\n") if line]
        return {}
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed")


# ── Endpoints ──

@router.get("/lists", response_model=TaskListsOutput)
async def list_task_lists():
    """List all task lists."""
    data = run_gws(["tasks", "tasklists", "list"])
    items = data.get("items", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return TaskListsOutput(task_lists=items)


@router.get("/tasks", response_model=TasksOutput)
async def list_tasks(tasklist: Optional[str] = None):
    """List tasks in a task list."""
    params = {}
    if tasklist:
        params["tasklist"] = tasklist
    args = ["tasks", "tasks", "list"]
    if params:
        args.extend(["--params", json.dumps(params)])
    data = run_gws(args)
    items = data.get("items", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return TasksOutput(tasks=items)


@router.post("/tasks/create", response_model=OperationOutput)
async def create_task(body: CreateTaskInput):
    """Create a new task."""
    task_body = {"title": body.title}
    if body.notes:
        task_body["notes"] = body.notes
    if body.due:
        task_body["due"] = body.due
    params = {}
    if body.tasklist:
        params["tasklist"] = body.tasklist
    args = ["tasks", "tasks", "insert", "--json", json.dumps(task_body)]
    if params:
        args.extend(["--params", json.dumps(params)])
    output = run_gws(args)
    return OperationOutput(success=True, message=str(output)[:200])
