import asyncio
import os
import pytest
from arq.connections import create_pool, RedisSettings
from arq.worker import Worker

from app.core.config import settings
from app.models.organization import Organization
from app.models.crm import Lead
from app.models.job import BackgroundJob
from app.services.job_service import submit_job
from app.jobs.queue import enqueue_job
from app.jobs.runner import run_job


async def is_redis_available() -> bool:
    try:
        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        try:
            await pool.ping()
            return True
        finally:
            await pool.aclose()
    except Exception:
        return False


@pytest.mark.redis
@pytest.mark.asyncio
async def test_arq_real_redis_end_to_end_job(db_session, monkeypatch):
    """End-to-end integration test: enqueue to real Redis and process via ARQ Worker."""
    redis_available = await is_redis_available()
    if not redis_available:
        pytest.skip(f"Redis is not available at {settings.REDIS_URL}. Skipped on local machines without Redis.")

    # Use queue mode for durable Redis execution
    monkeypatch.setattr(settings, "JOBS_EXECUTION_MODE", "queue")

    # Point runner session to test database session maker
    from tests.conftest import TestingSessionLocal
    monkeypatch.setattr("app.jobs.runner.AsyncSessionLocal", TestingSessionLocal)

    # 1. Setup tenant and lead data
    org = Organization(name="Redis Integration Org", slug="redis-integ-org")
    db_session.add(org)
    await db_session.flush()

    lead = Lead(
        org_id=org.id,
        title="Acme Cloud Migration",
        status="open",
        value_cents=500000,
        currency="USD",
    )
    db_session.add(lead)
    await db_session.commit()

    # 2. Submit background job
    job, deduplicated = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": lead.id, "title": "Acme Cloud Migration Quote"},
        subject_type="lead",
        subject_id=lead.id,
    )
    assert not deduplicated
    assert job.status == "queued"

    # 3. Enqueue to real Redis through ARQ
    enqueued = await enqueue_job(job.id)
    assert enqueued is True

    # 4. Process queue via ARQ Worker
    worker = Worker(
        functions=[run_job],
        queue_name=settings.JOBS_QUEUE_NAME,
        redis_settings=RedisSettings.from_dsn(settings.REDIS_URL),
        max_jobs=1,
        job_timeout=60,
    )

    # run_check executes pending jobs in Redis queue and raises on failure
    completed_count = await worker.run_check()
    assert completed_count >= 1

    # 5. Verify database state
    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.progress == 100
    assert job.result is not None
    assert "quote" in job.result
    assert job.finished_at is not None
