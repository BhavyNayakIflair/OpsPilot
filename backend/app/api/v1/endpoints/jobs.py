import asyncio
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Callable

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_membership, get_current_tenant, get_current_user
from app.core.security import decode_token
from app.models.content import WorkflowStep
from app.models.job import BackgroundJob
from app.models.membership import Membership, RoleType
from app.models.organization import Organization
from app.models.user import User
from app.schemas.jobs import JobRead
from app.services.job_service import (
    acknowledge,
    list_jobs as query_jobs,
    submit_job,
)

router = APIRouter()
_active_streams: dict[str, int] = defaultdict(int)
_stream_lock = asyncio.Lock()
_TERMINAL = {"completed", "failed", "cancelled"}


def _job_read(job: BackgroundJob, *, include_result: bool = True) -> dict[str, Any]:
    data = JobRead.model_validate(job).model_dump(mode="json")
    if not include_result:
        data["result"] = None
    return data


async def _stream_jobs(
    session_factory: Callable[[], Any],
    org_id: str,
    user_id: str,
    is_disconnected: Callable[[], Any],
    poll_seconds: float,
    max_seconds: float,
) -> AsyncIterator[str]:
    started = time.monotonic()
    last_ping = started
    versions: dict[str, int] = {}
    async with session_factory() as db:
        active = await query_jobs(
            db,
            org_id,
            user_id=user_id,
            mine=True,
            active=True,
            limit=100,
        )
        recent = await query_jobs(
            db,
            org_id,
            user_id=user_id,
            mine=True,
            since=datetime.now(timezone.utc) - timedelta(hours=24),
            limit=100,
        )
    snapshot = {job.id: job for job in [*active, *recent]}
    for job in snapshot.values():
        versions[job.id] = job.version
    yield f"event: snapshot\ndata: {json.dumps([_job_read(job) for job in snapshot.values()])}\n\n"

    while True:
        if await is_disconnected():
            return
        elapsed = time.monotonic() - started
        if elapsed >= max_seconds:
            yield 'event: reconnect\ndata: {"reason":"max_duration"}\n\n'
            return

        async with session_factory() as db:
            current_active = await query_jobs(
                db,
                org_id,
                user_id=user_id,
                mine=True,
                active=True,
                limit=100,
            )
            recent_terminal = await query_jobs(
                db,
                org_id,
                user_id=user_id,
                mine=True,
                since=datetime.now(timezone.utc) - timedelta(hours=24),
                limit=100,
            )
        current_jobs = {job.id: job for job in [*current_active, *recent_terminal]}
        for job in current_jobs.values():
            if versions.get(job.id) != job.version:
                versions[job.id] = job.version
                yield f"event: job\ndata: {json.dumps(_job_read(job))}\n\n"

        now = time.monotonic()
        if now - last_ping >= 15:
            yield ": ping\n\n"
            last_ping = now
        await asyncio.sleep(poll_seconds)


async def job_event_stream(
    session_factory: Callable[[], Any],
    org_id: str,
    user_id: str,
    is_disconnected: Callable[[], Any],
    poll_seconds: float,
    max_seconds: float,
) -> AsyncIterator[str]:
    """DB-backed multiplexed stream; each poll borrows a short-lived session."""
    async for event in _stream_jobs(
        session_factory, org_id, user_id, is_disconnected, poll_seconds, max_seconds
    ):
        yield event


async def _stream_identity(authorization: str | None, org_id: str | None) -> tuple[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication credentials were not provided")
    payload = decode_token(authorization.removeprefix("Bearer ").strip())
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    async with AsyncSessionLocal() as db:
        memberships = select(Membership).where(Membership.user_id == user_id)
        if org_id:
            memberships = memberships.where(Membership.org_id == org_id)
        membership = await db.scalar(memberships)
        if not membership:
            raise HTTPException(status_code=404, detail="Organization not found")
        org = await db.scalar(select(Organization).where(
            Organization.id == membership.org_id,
            Organization.is_active.is_(True),
        ))
        user = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
        if not org or not user:
            raise HTTPException(status_code=401, detail="Invalid authentication context")
        return org.id, user.id


@router.get("/stream")
async def stream_jobs(
    request: Request,
    authorization: str | None = Header(default=None),
    x_org_id: str | None = Header(default=None, alias="X-Org-ID"),
):
    org_id, user_id = await _stream_identity(authorization, x_org_id)
    async with _stream_lock:
        if _active_streams[user_id] >= 5:
            raise HTTPException(status_code=429, detail="Too many active job streams")
        _active_streams[user_id] += 1

    async def counted_stream():
        try:
            async for chunk in job_event_stream(
                AsyncSessionLocal,
                org_id,
                user_id,
                request.is_disconnected,
                settings.JOBS_SSE_POLL_SECONDS,
                settings.JOBS_SSE_MAX_SECONDS,
            ):
                yield chunk
        finally:
            async with _stream_lock:
                _active_streams[user_id] -= 1
                if _active_streams[user_id] <= 0:
                    _active_streams.pop(user_id, None)

    return StreamingResponse(
        counted_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("")
async def get_jobs(
    active: bool = False,
    status: str | None = None,
    job_type: str | None = None,
    since: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    mine: bool = True,
    include_acknowledged: bool = False,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_tenant),
    membership: Membership = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    is_owner = membership.role == RoleType.OWNER.value
    if not mine and not is_owner:
        raise HTTPException(status_code=403, detail="Only organization owners can list all jobs")
    jobs = await query_jobs(
        db,
        org.id,
        user_id=user.id,
        mine=mine,
        owner=is_owner,
        active=active,
        status=status,
        job_type=job_type,
        since=since,
        limit=limit,
        include_acknowledged=include_acknowledged,
    )
    return [_job_read(job, include_result=job.status in _TERMINAL) for job in jobs]


@router.get("/{job_id}")
async def get_job_details(
    job_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_tenant),
    membership: Membership = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    job = await db.scalar(select(BackgroundJob).where(
        BackgroundJob.id == job_id,
        BackgroundJob.org_id == org.id,
        *(([] if membership.role == RoleType.OWNER.value else [BackgroundJob.user_id == user.id])),
    ))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    data = _job_read(job, include_result=job.status in _TERMINAL)
    if job.workflow_run_id:
        steps = (await db.scalars(select(WorkflowStep).where(
            WorkflowStep.org_id == org.id,
            WorkflowStep.workflow_run_id == job.workflow_run_id,
        ).order_by(WorkflowStep.created_at))).all()
        data["steps"] = jsonable_encoder(steps)
    return data


@router.post("/{job_id}/ack")
async def acknowledge_job(
    job_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_tenant),
    membership: Membership = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    job = await acknowledge(
        db,
        org.id,
        job_id,
        None if membership.role == RoleType.OWNER.value else user.id,
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_read(job)


@router.post("/{job_id}/retry", status_code=202)
async def retry_job(
    job_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_tenant),
    membership: Membership = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    query = select(BackgroundJob).where(
        BackgroundJob.id == job_id,
        BackgroundJob.org_id == org.id,
    )
    if membership.role != RoleType.OWNER.value:
        query = query.where(BackgroundJob.user_id == user.id)
    job = await db.scalar(query)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "failed":
        raise HTTPException(status_code=409, detail="Only failed jobs can be retried")
    retry, deduplicated = await submit_job(
        db,
        org_id=org.id,
        user_id=user.id,
        job_type=job.job_type,
        input_data=dict(job.input),
        subject_type=job.subject_type,
        subject_id=job.subject_id,
        subject_label=job.subject_label,
        workflow_run_id=job.workflow_run_id,
        retry_of_job_id=job.id,
        max_attempts=job.max_attempts,
    )
    from app.jobs.queue import enqueue_job

    if retry.status == "queued":
        await enqueue_job(retry.id)
    return {
        "job_id": retry.id,
        "status": retry.status,
        "message": retry.message,
        "deduplicated": deduplicated,
    }
