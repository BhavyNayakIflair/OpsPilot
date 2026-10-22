import asyncio
import logging

import structlog
from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.gateway.base import ProviderError
from app.gateway.factory import get_llm_provider
from app.jobs.handlers import HANDLERS
from app.models.job import BackgroundJob
from app.services.job_service import claim_job, complete, fail, heartbeat, set_progress

logger = structlog.get_logger(__name__)
_log = logging.getLogger(__name__)
provider_factory = get_llm_provider


def _public_error(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "timeout", "The AI operation timed out. Please retry."
    if isinstance(exc, ProviderError):
        return "provider_error", "The AI provider could not complete this operation. Please retry."
    if isinstance(exc, LookupError):
        return "lead_unavailable", str(exc)
    if isinstance(exc, HTTPException) and exc.status_code in (404, 409):
        return "lead_unavailable", "The requested lead is no longer available."
    return "internal_error", "The operation failed unexpectedly. Please retry."


async def _send_heartbeats(job_id: str) -> None:
    while True:
        await asyncio.sleep(10)
        async with AsyncSessionLocal() as db:
            await heartbeat(db, job_id)


async def run_job(ctx: dict, job_id: str) -> None:
    async with AsyncSessionLocal() as db:
        if not await claim_job(db, job_id):
            return

    heartbeat_task = asyncio.create_task(_send_heartbeats(job_id), name=f"heartbeat-{job_id}")
    try:
        async with AsyncSessionLocal() as db:
            job = await db.scalar(select(BackgroundJob).where(BackgroundJob.id == job_id))
            if not job:
                return
            logger.info(
                "Running background job",
                job_id=job.id,
                org_id=job.org_id,
                job_type=job.job_type,
            )
            handler = HANDLERS.get(job.job_type)
            if handler is None:
                raise ValueError(f"No handler registered for job type {job.job_type}")
            provider = provider_factory()
            outcome = await handler(db, job, provider)
            result = outcome.get("result")
            if outcome.get("status") == "waiting_for_approval":
                job.status = "waiting_for_approval"
                job.progress = 100
                job.message = outcome.get("message", "Waiting for approval")
                job.result = result
                job.version += 1
                from datetime import datetime, timezone

                job.updated_at = datetime.now(timezone.utc)
                await db.commit()
            else:
                await set_progress(db, job_id, 100, "Job completed", commit=False)
                await complete(
                    db,
                    job_id,
                    result,
                    result_ref_type=outcome.get("result_ref_type"),
                    result_ref_id=outcome.get("result_ref_id"),
                    commit=False,
                )
                await db.commit()
    except Exception as exc:
        _log.exception("Background job failed", extra={"job_id": job_id})
        async with AsyncSessionLocal() as db:
            await db.rollback()
            error_code, message = _public_error(exc)
            await fail(db, job_id, error_code, message)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
