"""Google Calendar Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import json
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class EventsOutput(BaseModel):
    events: List[Dict[str, Any]]

class CalendarsOutput(BaseModel):
    calendars: List[Dict[str, Any]]

class CreateEventInput(BaseModel):
    summary: str = Field(..., description="Event title")
    start: str = Field(..., description="Start time (ISO 8601)")
    end: str = Field(..., description="End time (ISO 8601)")
    location: Optional[str] = None
    description: Optional[str] = None

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

@router.get("/events", response_model=EventsOutput)
async def list_events(days: int = 7):
    """List upcoming events via +agenda helper."""
    data = run_gws(["calendar", "+agenda", "--days", str(days)])
    if isinstance(data, list):
        return EventsOutput(events=data)
    items = data.get("items", []) if isinstance(data, dict) else []
    return EventsOutput(events=items)


@router.get("/events/today", response_model=EventsOutput)
async def today_events():
    """List today's events."""
    data = run_gws(["calendar", "+agenda", "--today"])
    if isinstance(data, list):
        return EventsOutput(events=data)
    items = data.get("items", []) if isinstance(data, dict) else []
    return EventsOutput(events=items)


@router.get("/calendars", response_model=CalendarsOutput)
async def list_calendars():
    """List all accessible calendars."""
    data = run_gws(["calendar", "calendarList", "list"])
    items = data.get("items", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return CalendarsOutput(calendars=items)


@router.post("/events/create", response_model=OperationOutput)
async def create_event(body: CreateEventInput):
    """Create a new calendar event via +insert helper."""
    args = ["calendar", "+insert", body.summary, "--start", body.start, "--end", body.end]
    if body.location:
        args.extend(["--location", body.location])
    if body.description:
        args.extend(["--description", body.description])
    output = run_gws(args)
    return OperationOutput(success=True, message=str(output)[:200])
