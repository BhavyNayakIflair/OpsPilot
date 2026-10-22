import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import BackgroundJob

ACTIVE_STATUSES = ("queued", "running", "waiting_for_approval")
TERMINAL_STATUSES = ("completed", "failed", "cancelled")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fingerprint(job_type: str, org_id: str, user_id: str | None, data: dict[str, Any]) -> str:
    normalized = json.dumps(
        {"job_type": job_type, "org_id": org_id, "user_id": user_id, "input": data},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def submit_job(
    db: AsyncSession,
    *,
    org_id: str,
    user_id: str | None,
    job_type: str,
    input_data: dict[str, Any],
    idempotency_key: str | None = None,
    subject_type: str | None = None,
    subject_id: str | None = None,
    subject_label: str | None = None,
    workflow_run_id: str | None = None,
    retry_of_job_id: str | None = None,
    max_attempts: int = 2,
) -> tuple[BackgroundJob, bool]:
    if idempotency_key is not None and len(idempotency_key) > 80:
        raise HTTPException(status_code=422, detail="Idempotency-Key must be at most 80 characters")
    fingerprint = _fingerprint(job_type, org_id, user_id, input_data)
    if idempotency_key:
        existing = await db.scalar(select(BackgroundJob).where(
            BackgroundJob.org_id == org_id,
            BackgroundJob.idempotency_key == idempotency_key,
        ))
        if existing:
            if existing.request_fingerprint != fingerprint:
                raise HTTPException(status_code=422, detail="Idempotency-Key was already used with a different request")
            return existing, True

    existing = await db.scalar(select(BackgroundJob).where(
        BackgroundJob.org_id == org_id,
        BackgroundJob.user_id == user_id,
        BackgroundJob.job_type == job_type,
        BackgroundJob.request_fingerprint == fingerprint,
        BackgroundJob.status.in_(ACTIVE_STATUSES),
    ))
    if existing:
        return existing, True

    now = _now()
    job = BackgroundJob(
        id=str(uuid.uuid4()),
        org_id=org_id,
        user_id=user_id,
        job_type=job_type,
        status="queued",
        progress=0,
        message="Job queued",
        input=input_data,
        request_fingerprint=fingerprint,
        idempotency_key=idempotency_key,
        subject_type=subject_type,
        subject_id=subject_id,
        subject_label=subject_label,
        workflow_run_id=workflow_run_id,
        retry_of_job_id=retry_of_job_id,
        max_attempts=max_attempts,
        version=1,
        queued_at=now,
    )
    db.add(job)
    try:
        await db.commit()
        await db.refresh(job)
        return job, False
    except IntegrityError:
        await db.rollback()
        if idempotency_key:
            winner = await db.scalar(select(BackgroundJob).where(
                BackgroundJob.org_id == org_id,
                BackgroundJob.idempotency_key == idempotency_key,
            ))
            if winner:
                if winner.request_fingerprint != fingerprint:
                    raise HTTPException(status_code=422, detail="Idempotency-Key was already used with a different request")
                return winner, True
        winner = await db.scalar(select(BackgroundJob).where(
            BackgroundJob.org_id == org_id,
            BackgroundJob.user_id == user_id,
            BackgroundJob.job_type == job_type,
            BackgroundJob.request_fingerprint == fingerprint,
            BackgroundJob.status.in_(ACTIVE_STATUSES),
        ))
        if winner:
            return winner, True
        raise


async def claim_job(db: AsyncSession, job_id: str) -> bool:
    now = _now()
    result = await db.execute(
        update(BackgroundJob)
        .where(BackgroundJob.id == job_id, BackgroundJob.status == "queued")
        .values(
            status="running",
            message="Starting job",
            attempts=BackgroundJob.attempts + 1,
            started_at=now,
            heartbeat_at=now,
            version=BackgroundJob.version + 1,
            updated_at=now,
        )
    )
    await db.commit()
    return result.rowcount == 1


async def _change_job(
    db: AsyncSession,
    job_id: str,
    *,
    commit: bool = True,
    **changes: Any,
) -> BackgroundJob | None:
    job = await db.get(BackgroundJob, job_id)
    if not job:
        return None
    for key, value in changes.items():
        setattr(job, key, value)
    job.version += 1
    job.updated_at = _now()
    if commit:
        await db.commit()
        await db.refresh(job)
    else:
        await db.flush()
    return job


async def set_progress(
    db: AsyncSession, job_id: str, progress: int, message: str, *, commit: bool = True
) -> BackgroundJob | None:
    if not 0 <= progress <= 100:
        raise ValueError("Job progress must be between 0 and 100")
    return await _change_job(db, job_id, progress=progress, message=message, commit=commit)


async def complete(
    db: AsyncSession,
    job_id: str,
    result: Any = None,
    *,
    result_ref_type: str | None = None,
    result_ref_id: str | None = None,
    message: str = "Job completed",
    commit: bool = True,
) -> BackgroundJob | None:
    return await _change_job(
        db,
        job_id,
        status="completed",
        progress=100,
        message=message,
        result=result,
        result_ref_type=result_ref_type,
        result_ref_id=result_ref_id,
        error_code=None,
        error_message=None,
        finished_at=_now(),
        commit=commit,
    )


async def fail(
    db: AsyncSession,
    job_id: str,
    error_code: str,
    error_message: str,
    *,
    commit: bool = True,
) -> BackgroundJob | None:
    return await _change_job(
        db,
        job_id,
        status="failed",
        progress=100,
        message=error_message,
        error_code=error_code,
        error_message=error_message,
        finished_at=_now(),
        commit=commit,
    )


async def heartbeat(db: AsyncSession, job_id: str, *, commit: bool = True) -> BackgroundJob | None:
    now = _now()
    return await _change_job(db, job_id, heartbeat_at=now, commit=commit)


async def requeue(db: AsyncSession, job_id: str, *, message: str = "Waiting for an available worker") -> BackgroundJob | None:
    return await _change_job(
        db,
        job_id,
        status="queued",
        progress=0,
        message=message,
        started_at=None,
        heartbeat_at=None,
        queued_at=_now(),
    )


async def get_job(db: AsyncSession, org_id: str, job_id: str, user_id: str | None = None) -> BackgroundJob | None:
    query = select(BackgroundJob).where(BackgroundJob.id == job_id, BackgroundJob.org_id == org_id)
    if user_id is not None:
        query = query.where(BackgroundJob.user_id == user_id)
    return await db.scalar(query)


async def list_jobs(
    db: AsyncSession,
    org_id: str,
    *,
    user_id: str | None = None,
    mine: bool = True,
    owner: bool = False,
    active: bool = False,
    status: str | None = None,
    job_type: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
    include_acknowledged: bool = False,
) -> list[BackgroundJob]:
    query = select(BackgroundJob).where(BackgroundJob.org_id == org_id)
    if mine or not owner:
        query = query.where(BackgroundJob.user_id == user_id)
    if active:
        query = query.where(BackgroundJob.status.in_(ACTIVE_STATUSES))
    elif not include_acknowledged:
        query = query.where(BackgroundJob.acknowledged_at.is_(None))
    if status:
        query = query.where(BackgroundJob.status == status)
    if job_type:
        query = query.where(BackgroundJob.job_type == job_type)
    if since:
        query = query.where(BackgroundJob.created_at >= since)
    return list((await db.scalars(query.order_by(BackgroundJob.created_at.desc()).limit(min(limit, 100)))).all())


async def acknowledge(db: AsyncSession, org_id: str, job_id: str, user_id: str | None = None) -> BackgroundJob | None:
    job = await get_job(db, org_id, job_id, user_id)
    if not job:
        return None
    if job.acknowledged_at is None:
        job.acknowledged_at = _now()
        job.version += 1
        job.updated_at = _now()
        await db.commit()
        await db.refresh(job)
    return job
