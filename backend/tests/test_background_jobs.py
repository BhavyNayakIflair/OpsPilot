import asyncio
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import inspect, select

from app.models.organization import Organization
from app.models.user import User
from app.models.job import BackgroundJob
from app.services.job_service import (
    claim_job,
    complete,
    fail,
    get_job,
    heartbeat,
    list_jobs,
    requeue,
    set_progress,
    submit_job,
    acknowledge,
    _change_job,
)
from app.workers.reaper import reap_jobs


@pytest.mark.asyncio
async def test_concurrency_multiple_claims_on_same_job(db_session):
    """Concurrency: Only one worker can claim a queued job; second claim fails."""
    org = Organization(name="Concurrency Org", slug="concurrency-org")
    db_session.add(org)
    await db_session.commit()

    job, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-c1"},
    )
    assert job.status == "queued"
    assert job.attempts == 0
    assert job.version == 1

    first_claim = await claim_job(db_session, job.id)
    second_claim = await claim_job(db_session, job.id)

    assert first_claim is True
    assert second_claim is False

    await db_session.refresh(job)
    assert job.status == "running"
    assert job.attempts == 1
    assert job.version == 2
    assert job.started_at is not None
    assert job.heartbeat_at is not None


@pytest.mark.asyncio
async def test_deduplication_fingerprint_and_idempotency_key(db_session):
    """Deduplication: active request fingerprint and idempotency key handling."""
    org = Organization(name="Dedupe Org", slug="dedupe-org")
    db_session.add(org)
    await db_session.commit()

    # 1. Active fingerprint deduplication
    job1, dedup1 = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-1",
        job_type="quote_agent",
        input_data={"lead_id": "lead-dedup-1", "amount": 100},
    )
    assert dedup1 is False

    job2, dedup2 = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-1",
        job_type="quote_agent",
        input_data={"lead_id": "lead-dedup-1", "amount": 100},
    )
    assert dedup2 is True
    assert job2.id == job1.id

    # 2. Idempotency key exact match
    job3, dedup3 = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-1",
        job_type="quote_draft",
        input_data={"lead_id": "lead-idemp-1"},
        idempotency_key="key-abc-123",
    )
    assert dedup3 is False

    job4, dedup4 = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-1",
        job_type="quote_draft",
        input_data={"lead_id": "lead-idemp-1"},
        idempotency_key="key-abc-123",
    )
    assert dedup4 is True
    assert job4.id == job3.id

    # 3. Idempotency key reuse with different payload raises 422
    with pytest.raises(HTTPException) as exc:
        await submit_job(
            db_session,
            org_id=org.id,
            user_id="user-1",
            job_type="quote_draft",
            input_data={"lead_id": "lead-idemp-DIFFERENT"},
            idempotency_key="key-abc-123",
        )
    assert exc.value.status_code == 422

    # 4. Completed job allows a new active job with same fingerprint
    await complete(db_session, job1.id, {"quote": {}})
    job5, dedup5 = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-1",
        job_type="quote_agent",
        input_data={"lead_id": "lead-dedup-1", "amount": 100},
    )
    assert dedup5 is False
    assert job5.id != job1.id


@pytest.mark.asyncio
async def test_reaper_recovery_stale_heartbeat_and_max_attempts(db_session, monkeypatch):
    """Reaper recovery: stale heartbeat requeues when attempts < max_attempts, fails when attempts >= max_attempts."""
    org = Organization(name="Reaper Org", slug="reaper-org")
    db_session.add(org)
    await db_session.commit()

    # Avoid Redis dependency in unit test by monkeypatching enqueue_job
    enqueued_jobs = []
    async def mock_enqueue_job(job_id: str):
        enqueued_jobs.append(job_id)

    monkeypatch.setattr("app.workers.reaper.enqueue_job", mock_enqueue_job)
    # Monkeypatch AsyncSessionLocal so reap_jobs uses the same test database
    from tests.conftest import TestingSessionLocal
    monkeypatch.setattr("app.workers.reaper.AsyncSessionLocal", TestingSessionLocal)

    # Job A: attempts=1, max_attempts=2, stale heartbeat -> should requeue
    stale_time = datetime.now(timezone.utc) - timedelta(seconds=120)
    job_requeue, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-reaper-1"},
        max_attempts=2,
    )
    await claim_job(db_session, job_requeue.id)
    job_requeue.heartbeat_at = stale_time
    await db_session.commit()

    # Job B: attempts=2, max_attempts=2, stale heartbeat -> should fail
    job_fail, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-reaper-2"},
        max_attempts=2,
    )
    await claim_job(db_session, job_fail.id)
    job_fail.attempts = 2
    job_fail.heartbeat_at = stale_time
    await db_session.commit()

    # Job C: running with fresh heartbeat -> should remain running
    job_healthy, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-reaper-3"},
        max_attempts=2,
    )
    await claim_job(db_session, job_healthy.id)
    job_healthy.heartbeat_at = datetime.now(timezone.utc)
    await db_session.commit()

    # Job D: stale heartbeat but already has result_ref_id -> should be completed
    job_recovered, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-reaper-4"},
        max_attempts=2,
    )
    await claim_job(db_session, job_recovered.id)
    job_recovered.result_ref_id = "quote-generated-before-crash"
    job_recovered.heartbeat_at = stale_time
    await db_session.commit()

    # Run reaper
    await reap_jobs()

    # Verify Job A requeued
    await db_session.refresh(job_requeue)
    assert job_requeue.status == "queued"
    assert job_requeue.message == "Recovering interrupted job"
    assert job_requeue.id in enqueued_jobs

    # Verify Job B failed
    await db_session.refresh(job_fail)
    assert job_fail.status == "failed"
    assert job_fail.error_code == "worker_lost"

    # Verify Job C untouched
    await db_session.refresh(job_healthy)
    assert job_healthy.status == "running"

    # Verify Job D completed
    await db_session.refresh(job_recovered)
    assert job_recovered.status == "completed"
    assert job_recovered.progress == 100


@pytest.mark.asyncio
async def test_approvals_waiting_for_approval_status_handling(db_session):
    """Approvals: waiting_for_approval status handling and active status deduplication."""
    org = Organization(name="Approval Org", slug="approval-org")
    db_session.add(org)
    await db_session.commit()

    job, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-approver",
        job_type="quote_agent",
        input_data={"lead_id": "lead-approval-1"},
    )
    await claim_job(db_session, job.id)

    # Transition to waiting_for_approval
    await _change_job(
        db_session,
        job.id,
        status="waiting_for_approval",
        progress=100,
        message="Quote flagged for discount approval",
        result={"discount_bps": 2500, "flag": "High discount"},
    )
    await db_session.refresh(job)
    assert job.status == "waiting_for_approval"

    # Verify it is counted as active: duplicate submission is deduplicated
    dup_job, deduplicated = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-approver",
        job_type="quote_agent",
        input_data={"lead_id": "lead-approval-1"},
    )
    assert deduplicated is True
    assert dup_job.id == job.id

    # Verify it appears in active job queries
    active_jobs = await list_jobs(db_session, org.id, user_id="user-approver", active=True)
    assert any(j.id == job.id for j in active_jobs)

    # Complete the approval
    await complete(
        db_session,
        job.id,
        result={"outcome": "approved", "quote_id": "q-123"},
        result_ref_type="quote",
        result_ref_id="q-123",
        message="Quote approved",
    )
    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.result["outcome"] == "approved"
    assert job.result_ref_id == "q-123"


@pytest.mark.asyncio
async def test_crud_while_running(db_session):
    """CRUD-while-running: get_job, list_jobs, set_progress, heartbeat, acknowledge while job is running."""
    org = Organization(name="CRUD Org", slug="crud-org")
    db_session.add(org)
    await db_session.commit()

    job, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id="user-crud",
        job_type="quote_draft",
        input_data={"lead_id": "lead-crud-1"},
    )
    await claim_job(db_session, job.id)

    # 1. Read job while running
    fetched = await get_job(db_session, org.id, job.id, user_id="user-crud")
    assert fetched is not None
    assert fetched.status == "running"

    # 2. Update progress while running
    updated = await set_progress(db_session, job.id, 50, "Generating line items")
    assert updated is not None
    assert updated.progress == 50
    assert updated.message == "Generating line items"
    assert updated.version == 3

    # 3. Heartbeat update while running
    hb_job = await heartbeat(db_session, job.id)
    assert hb_job is not None
    assert hb_job.heartbeat_at is not None

    # 4. List active jobs while running
    active_list = await list_jobs(db_session, org.id, user_id="user-crud", active=True)
    assert len(active_list) == 1
    assert active_list[0].id == job.id

    # 5. Acknowledge while running
    acked = await acknowledge(db_session, org.id, job.id, user_id="user-crud")
    assert acked is not None
    assert acked.acknowledged_at is not None

    # 6. Default list excludes acknowledged jobs, but include_acknowledged=True returns it
    unacked_list = await list_jobs(db_session, org.id, user_id="user-crud", include_acknowledged=False)
    assert not any(j.id == job.id for j in unacked_list)

    acked_list = await list_jobs(db_session, org.id, user_id="user-crud", include_acknowledged=True)
    assert any(j.id == job.id for j in acked_list)


@pytest.mark.asyncio
async def test_background_job_table_schema(db_session):
    """Schema: Verify BackgroundJob table structure, column names and types."""
    from tests.conftest import test_engine

    async with test_engine.connect() as conn:
        columns = await conn.run_sync(
            lambda sync_conn: {col["name"]: col for col in inspect(sync_conn).get_columns("background_jobs")}
        )

    expected_columns = [
        "id",
        "org_id",
        "user_id",
        "job_type",
        "status",
        "progress",
        "message",
        "input",
        "request_fingerprint",
        "idempotency_key",
        "result",
        "result_ref_type",
        "result_ref_id",
        "error_code",
        "error_message",
        "subject_type",
        "subject_id",
        "subject_label",
        "workflow_run_id",
        "retry_of_job_id",
        "attempts",
        "max_attempts",
        "version",
        "queued_at",
        "started_at",
        "finished_at",
        "heartbeat_at",
        "acknowledged_at",
        "created_at",
        "updated_at",
    ]

    for col_name in expected_columns:
        assert col_name in columns, f"Column '{col_name}' missing from background_jobs table"

    # Check non-nullable constraints
    assert columns["id"]["nullable"] is False
    assert columns["org_id"]["nullable"] is False
    assert columns["job_type"]["nullable"] is False
    assert columns["status"]["nullable"] is False
    assert columns["progress"]["nullable"] is False
    assert columns["version"]["nullable"] is False
