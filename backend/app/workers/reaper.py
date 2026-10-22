from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.jobs.queue import enqueue_job
from app.models.job import BackgroundJob
from app.services.job_service import complete, fail, requeue


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def reap_jobs(_ctx: dict | None = None) -> None:
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(seconds=settings.JOBS_STALE_HEARTBEAT_SECONDS)
    queued_before = now - timedelta(seconds=60)
    enqueue_ids: list[str] = []

    async with AsyncSessionLocal() as db:
        running = (await db.scalars(select(BackgroundJob).where(
            BackgroundJob.status == "running",
        ))).all()
        for job in running:
            heartbeat_at = _aware(job.heartbeat_at)
            if heartbeat_at is not None and heartbeat_at >= stale_before:
                continue
            if job.result_ref_id:
                job.status = "completed"
                job.progress = 100
                job.message = "Job completed during recovery"
                job.finished_at = now
                job.version += 1
                job.updated_at = now
            elif job.attempts < job.max_attempts:
                await requeue(db, job.id, message="Recovering interrupted job")
                enqueue_ids.append(job.id)
            else:
                await fail(db, job.id, "worker_lost", "The worker stopped before this operation completed.")

        queued = (await db.scalars(select(BackgroundJob).where(
            BackgroundJob.status == "queued",
        ))).all()
        for job in queued:
            queued_at = _aware(job.queued_at)
            if queued_at is not None and queued_at < queued_before:
                enqueue_ids.append(job.id)
        await db.commit()

    for job_id in dict.fromkeys(enqueue_ids):
        await enqueue_job(job_id)


async def purge_terminal_jobs(_ctx: dict | None = None) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.JOBS_RETENTION_DAYS)
    async with AsyncSessionLocal() as db:
        await db.execute(delete(BackgroundJob).where(
            BackgroundJob.status.in_(("completed", "failed", "cancelled")),
            BackgroundJob.finished_at < cutoff,
        ))
        await db.commit()
