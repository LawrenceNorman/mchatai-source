"""DAG Workflow Engine — executes composed AIActions with retry, checkpoint, fan-out/fan-in."""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)


# ── Step Types ──

class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class StepResult:
    status: StepStatus
    data: Any = None
    error: str = ""
    tokens_used: float = 0.0
    duration_ms: int = 0


@dataclass
class Step:
    """A single sequential step in the workflow."""
    name: str
    service: str
    endpoint: str
    input_map: Callable  # (ctx) -> dict
    depends_on: list[str] = field(default_factory=list)
    condition: Callable | None = None  # (ctx) -> bool, skip if False
    max_retries: int = 3
    backoff_base: float = 2.0
    estimated_tokens: float = 0.1
    fallback_service: str = ""
    fallback_endpoint: str = ""


@dataclass
class FanOutStep:
    """A step that fans out over a dynamic list of items."""
    name: str
    service: str
    endpoint: str
    items_from: Callable  # (ctx) -> list[item]
    input_map: Callable  # (ctx, item) -> dict
    depends_on: list[str] = field(default_factory=list)
    condition: Callable | None = None
    max_concurrency: int = 5
    max_retries: int = 3
    backoff_base: float = 2.0
    estimated_tokens_per_item: float = 0.1
    allow_partial_failure: bool = True


# ── Workflow Context ──

@dataclass
class WorkflowContext:
    """Shared context for a workflow execution."""
    job_id: str
    user_id: str
    input: dict
    config: dict = field(default_factory=dict)
    results: dict = field(default_factory=dict)  # step_name -> result data
    tokens_consumed: float = 0.0
    tokens_budget: float = 100.0
    warnings: list[str] = field(default_factory=list)
    checkpoints: dict = field(default_factory=dict)  # step_name -> StepResult


# ── Service Registry ──

SERVICE_URLS: dict[str, str] = {}


def register_service(name: str, url: str):
    SERVICE_URLS[name] = url


def configure_services(services: dict[str, str]):
    """Bulk register service URLs. Called on startup."""
    SERVICE_URLS.update(services)


# ── Engine ──

class WorkflowEngine:
    """Executes a list of Step/FanOutStep objects against a WorkflowContext."""

    def __init__(self, checkpoint_store=None):
        self.checkpoint_store = checkpoint_store  # Firestore adapter (optional)

    async def execute(
        self,
        steps: list[Step | FanOutStep],
        ctx: WorkflowContext,
        progress_callback: Callable | None = None,
    ) -> WorkflowContext:
        """Execute all steps in dependency order."""
        total_steps = len(steps)
        completed = 0

        for step in steps:
            step_name = step.name

            # Check if already checkpointed (resume support)
            if step_name in ctx.checkpoints:
                cp = ctx.checkpoints[step_name]
                if cp.status == StepStatus.COMPLETE:
                    ctx.results[step_name] = cp.data
                    ctx.tokens_consumed += cp.tokens_used
                    completed += 1
                    logger.info(f"Resumed from checkpoint: {step_name}")
                    continue

            # Check dependencies
            for dep in step.depends_on:
                if dep not in ctx.results:
                    logger.error(f"Step {step_name} depends on {dep} which has no result")
                    ctx.warnings.append(f"Step {step_name}: missing dependency {dep}")
                    break

            # Check condition
            if step.condition and not step.condition(ctx):
                result = StepResult(status=StepStatus.SKIPPED)
                ctx.checkpoints[step_name] = result
                completed += 1
                logger.info(f"Skipped step: {step_name} (condition not met)")
                if progress_callback:
                    await progress_callback(step_name, completed, total_steps, "skipped")
                continue

            # Check budget
            est_tokens = (
                step.estimated_tokens if isinstance(step, Step)
                else step.estimated_tokens_per_item * 5  # rough estimate
            )
            if ctx.tokens_consumed + est_tokens > ctx.tokens_budget:
                logger.warning(f"Budget exhausted at step: {step_name}")
                if progress_callback:
                    await progress_callback(step_name, completed, total_steps, "paused_insufficient_tokens")
                return ctx

            # Execute
            start_time = time.monotonic()
            try:
                if isinstance(step, FanOutStep):
                    result = await self._execute_fan_out(step, ctx)
                else:
                    result = await self._execute_step(step, ctx)
            except Exception as e:
                logger.error(f"Step {step_name} failed: {e}")
                result = StepResult(status=StepStatus.FAILED, error=str(e))

            result.duration_ms = int((time.monotonic() - start_time) * 1000)
            ctx.checkpoints[step_name] = result

            if result.status == StepStatus.COMPLETE:
                ctx.results[step_name] = result.data
                ctx.tokens_consumed += result.tokens_used
                completed += 1
            elif result.status == StepStatus.FAILED:
                ctx.warnings.append(f"Step {step_name} failed: {result.error}")
                # For non-fan-out steps, failure is terminal
                if not isinstance(step, FanOutStep) or not step.allow_partial_failure:
                    logger.error(f"Workflow halted at step: {step_name}")
                    break

            # Save checkpoint
            if self.checkpoint_store:
                await self.checkpoint_store.save(ctx.job_id, step_name, result)

            if progress_callback:
                await progress_callback(step_name, completed, total_steps, result.status.value)

        return ctx

    async def _execute_step(self, step: Step, ctx: WorkflowContext) -> StepResult:
        """Execute a single step with retry and fallback."""
        input_data = step.input_map(ctx)
        input_data["job_id"] = ctx.job_id

        service_url = SERVICE_URLS.get(step.service, "")
        if not service_url:
            return StepResult(status=StepStatus.FAILED, error=f"Unknown service: {step.service}")

        # Try primary service
        result = await self._call_with_retry(
            url=f"{service_url}{step.endpoint}",
            data=input_data,
            max_retries=step.max_retries,
            backoff_base=step.backoff_base,
        )

        if result is not None:
            return StepResult(
                status=StepStatus.COMPLETE,
                data=result,
                tokens_used=step.estimated_tokens,
            )

        # Try fallback if configured
        if step.fallback_service and step.fallback_endpoint:
            fb_url = SERVICE_URLS.get(step.fallback_service, "")
            if fb_url:
                logger.info(f"Trying fallback for {step.name}: {step.fallback_service}")
                result = await self._call_with_retry(
                    url=f"{fb_url}{step.fallback_endpoint}",
                    data=input_data,
                    max_retries=1,
                    backoff_base=1.0,
                )
                if result is not None:
                    return StepResult(
                        status=StepStatus.COMPLETE,
                        data=result,
                        tokens_used=step.estimated_tokens,
                    )

        return StepResult(status=StepStatus.FAILED, error=f"All retries exhausted for {step.name}")

    async def _execute_fan_out(self, step: FanOutStep, ctx: WorkflowContext) -> StepResult:
        """Execute a fan-out step with bounded concurrency."""
        items = step.items_from(ctx)
        if not items:
            return StepResult(status=StepStatus.COMPLETE, data=[], tokens_used=0)

        service_url = SERVICE_URLS.get(step.service, "")
        if not service_url:
            return StepResult(status=StepStatus.FAILED, error=f"Unknown service: {step.service}")

        semaphore = asyncio.Semaphore(step.max_concurrency)
        results = []
        failures = []
        total_tokens = 0.0

        async def process_item(item, index):
            nonlocal total_tokens
            async with semaphore:
                input_data = step.input_map(ctx, item)
                input_data["job_id"] = ctx.job_id

                result = await self._call_with_retry(
                    url=f"{service_url}{step.endpoint}",
                    data=input_data,
                    max_retries=step.max_retries,
                    backoff_base=step.backoff_base,
                )

                if result is not None:
                    results.append(result)
                    total_tokens += step.estimated_tokens_per_item
                else:
                    failures.append(f"Item {index} failed")

        tasks = [process_item(item, i) for i, item in enumerate(items)]
        await asyncio.gather(*tasks, return_exceptions=True)

        if failures:
            for f in failures:
                ctx.warnings.append(f"Fan-out {step.name}: {f}")

        if not results and not step.allow_partial_failure:
            return StepResult(
                status=StepStatus.FAILED,
                error=f"All {len(items)} items failed in fan-out {step.name}",
            )

        return StepResult(
            status=StepStatus.COMPLETE,
            data=results,
            tokens_used=total_tokens,
        )

    async def _call_with_retry(
        self,
        url: str,
        data: dict,
        max_retries: int = 3,
        backoff_base: float = 2.0,
        timeout: float = 120.0,
    ) -> dict | None:
        """HTTP POST with exponential backoff retry."""
        delay = backoff_base

        for attempt in range(max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(url, json=data)
                    resp.raise_for_status()
                    return resp.json()
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"Retry {attempt + 1}/{max_retries} for {url}: {e}")
                    await asyncio.sleep(delay)
                    delay = min(delay * backoff_base, 60.0)
                else:
                    logger.error(f"All retries exhausted for {url}: {e}")

        return None
