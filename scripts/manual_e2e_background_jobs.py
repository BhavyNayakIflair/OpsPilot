#!/usr/bin/env python3
"""
OpsPilot - Manual End-to-End Background Jobs Workflow Script
Simulates and verifies full lifecycle user scenarios:
1. Normal async quote draft submission, progress updates, and completion
2. Double-click resubmission & idempotency enforcement
3. Worker death / crash and automatic reaper recovery
4. API restart survival (persistence across database reloads)
5. Strict multi-tenant isolation
6. Quote agent approval flagging, inbox listing, and human approval resumption
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.database import AsyncSessionLocal, Base, engine
from app.models.organization import Organization
from app.models.user import User
from app.models.crm import Lead
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


def banner(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


async def setup_test_environment():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def main():
    banner("OpsPilot Background Jobs - Manual End-to-End Verification")
    await setup_test_environment()

    async with AsyncSessionLocal() as db:
        # Create test tenants
        org_a = Organization(id=str(uuid.uuid4()), name="Org A - TechCorp", slug=f"techcorp-{uuid.uuid4().hex[:6]}")
        org_b = Organization(id=str(uuid.uuid4()), name="Org B - RivalServices", slug=f"rival-{uuid.uuid4().hex[:6]}")
        user_ops = User(
            id=str(uuid.uuid4()),
            email=f"ops-{uuid.uuid4().hex[:6]}@techcorp.com",
            hashed_password="fake-password-hash",
            full_name="Operations Engineer",
        )
        db.add_all([org_a, org_b, user_ops])
        await db.flush()

        user_ops_id = user_ops.id

        lead_a = Lead(
            id=str(uuid.uuid4()),
            org_id=org_a.id,
            title="Enterprise Portal Redesign",
            status="open",
            value_cents=1200000,
            currency="USD",
        )
        db.add(lead_a)
        await db.commit()

        print(f"✓ Provisioned tenant {org_a.name} ({org_a.id}), User {user_ops.email}, and Lead '{lead_a.title}'")

    # --------------------------------------------------------------------------
    # Scenario 1: Standard Lifecycle (Submit -> Claim -> Progress -> Complete)
    # --------------------------------------------------------------------------
    banner("Scenario 1: Standard Async Job Submission, Progress & Completion")
    async with AsyncSessionLocal() as db:
        idemp_key = f"user-click-{uuid.uuid4().hex[:8]}"
        job, dedup = await submit_job(
            db,
            org_id=org_a.id,
            user_id=user_ops_id,
            job_type="quote_draft",
            input_data={"lead_id": lead_a.id, "title": "Portal Redesign Quote"},
            idempotency_key=idemp_key,
            subject_type="lead",
            subject_id=lead_a.id,
            subject_label=lead_a.title,
        )
        assert not dedup, "First submission should not be deduplicated"
        assert job.status == "queued", f"Expected queued status, got {job.status}"
        print(f"✓ [1.1] Job submitted: ID={job.id}, Status={job.status}, Attempts={job.attempts}")

        # Worker claims job
        claimed = await claim_job(db, job.id)
        assert claimed is True, "Worker should successfully claim queued job"
        await db.refresh(job)
        print(f"✓ [1.2] Worker claimed job: Status={job.status}, Attempts={job.attempts}, StartedAt={job.started_at}")

        # Worker emits progress steps
        await set_progress(db, job.id, 30, "Reading lead CRM history...")
        await heartbeat(db, job.id)
        await set_progress(db, job.id, 70, "Calculating billable rates and line items...")
        await heartbeat(db, job.id)
        await db.refresh(job)
        print(f"✓ [1.3] Progress reported: Progress={job.progress}%, Message='{job.message}', Version={job.version}")

        # Worker completes job
        quote_payload = {
            "title": "Portal Redesign Quote",
            "lead_id": lead_a.id,
            "currency": "USD",
            "line_items": [
                {"description": "Architecture & UX Sprint", "quantity": 1, "unit_price_cents": 400000},
                {"description": "Core Backend Implementation", "quantity": 1, "unit_price_cents": 800000},
            ],
        }
        await complete(db, job.id, {"quote": quote_payload}, result_ref_type="quote", result_ref_id="quote-12345")
        await db.refresh(job)
        assert job.status == "completed"
        assert job.progress == 100
        print(f"✓ [1.4] Job completed: Status={job.status}, FinishedAt={job.finished_at}, ResultRefID={job.result_ref_id}")

    # --------------------------------------------------------------------------
    # Scenario 2: Double-Click and Idempotency Guard Verification
    # --------------------------------------------------------------------------
    banner("Scenario 2: Double-Click Protection & Idempotency Key Reuse")
    async with AsyncSessionLocal() as db:
        # Resubmit identical key and payload (e.g. user double-clicked)
        job_replay, dedup_replay = await submit_job(
            db,
            org_id=org_a.id,
            user_id=user_ops_id,
            job_type="quote_draft",
            input_data={"lead_id": lead_a.id, "title": "Portal Redesign Quote"},
            idempotency_key=idemp_key,
        )
        assert dedup_replay is True, "Replay with identical idempotency key must be flagged as deduplicated"
        assert job_replay.id == job.id, f"Expected same job {job.id}, got {job_replay.id}"
        print(f"✓ [2.1] Rapid re-click caught by idempotency key: Returned original Job ID={job_replay.id}")

        # Resubmit same key with different payload -> must fail with HTTP 422
        rejected = False
        try:
            await submit_job(
                db,
                org_id=org_a.id,
                user_id=user_ops_id,
                job_type="quote_draft",
                input_data={"lead_id": lead_a.id, "title": "DIFFERENT PAYLOAD"},
                idempotency_key=idemp_key,
            )
        except Exception as exc:
            rejected = True
            print(f"✓ [2.2] Changed payload with reused key rejected as expected: {exc}")
        assert rejected, "Reusing key with different payload must be rejected"

    # --------------------------------------------------------------------------
    # Scenario 3: Worker Interruption & Stale Heartbeat Reaper Recovery
    # --------------------------------------------------------------------------
    banner("Scenario 3: Worker Crash and Reaper Self-Healing")
    async with AsyncSessionLocal() as db:
        job_crash, _ = await submit_job(
            db,
            org_id=org_a.id,
            user_id=user_ops_id,
            job_type="quote_draft",
            input_data={"lead_id": lead_a.id, "title": "Crash Recovery Job"},
            max_attempts=2,
        )
        await claim_job(db, job_crash.id)
        # Simulate worker dying 120 seconds ago
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=120)
        job_crash.heartbeat_at = stale_time
        await db.commit()
        print(f"✓ [3.1] Simulated dead worker: Job={job_crash.id}, Attempts=1, Heartbeat was {stale_time.isoformat()}")

    # Monkeypatch reaper to use local test session
    import app.workers.reaper as reaper_mod
    reaper_mod.AsyncSessionLocal = AsyncSessionLocal
    # Dummy enqueue
    requeued_enqueued = []
    reaper_mod.enqueue_job = lambda jid: requeued_enqueued.append(jid) or asyncio.sleep(0)

    await reap_jobs()

    async with AsyncSessionLocal() as db:
        recovered = await db.get(BackgroundJob, job_crash.id)
        assert recovered.status == "queued", f"Expected requeued status, got {recovered.status}"
        assert recovered.message == "Recovering interrupted job"
        print(f"✓ [3.2] Reaper detected stale heartbeat and requeued: Status={recovered.status}, Msg='{recovered.message}'")

        # Simulate second worker claiming and dying again -> should now fail (max_attempts reached)
        await claim_job(db, recovered.id)
        recovered.heartbeat_at = stale_time
        recovered.attempts = 2
        await db.commit()

    await reap_jobs()

    async with AsyncSessionLocal() as db:
        final_job = await db.get(BackgroundJob, job_crash.id)
        assert final_job.status == "failed", f"Expected failed, got {final_job.status}"
        assert final_job.error_code == "worker_lost"
        print(f"✓ [3.3] Max attempts exceeded after worker lost: Status={final_job.status}, ErrorCode={final_job.error_code}")

    # --------------------------------------------------------------------------
    # Scenario 4: API Reboot / Persistence Verification
    # --------------------------------------------------------------------------
    banner("Scenario 4: API Restart / Persistence Survival")
    async with AsyncSessionLocal() as db:
        job_persist, _ = await submit_job(
            db,
            org_id=org_a.id,
            user_id=user_ops_id,
            job_type="quote_agent",
            input_data={"lead_id": lead_a.id},
        )
        await claim_job(db, job_persist.id)
        await set_progress(db, job_persist.id, 65, "Validating compliance flags...")
        saved_id = job_persist.id

    # Simulate API reboot by dropping all session state and reopening fresh
    await asyncio.sleep(0.1)

    async with AsyncSessionLocal() as fresh_db:
        reloaded = await get_job(fresh_db, org_a.id, saved_id)
        assert reloaded is not None
        assert reloaded.status == "running"
        assert reloaded.progress == 65
        assert reloaded.message == "Validating compliance flags..."
        print(f"✓ [4.1] Fresh API session reloaded job cleanly: ID={reloaded.id}, Progress={reloaded.progress}%, Status={reloaded.status}")

    # --------------------------------------------------------------------------
    # Scenario 5: Multi-Tenant Isolation
    # --------------------------------------------------------------------------
    banner("Scenario 5: Multi-Tenant Isolation Enforcement")
    async with AsyncSessionLocal() as db:
        # Org B attempts to read Org A's job
        cross_tenant_job = await get_job(db, org_b.id, saved_id)
        assert cross_tenant_job is None, "Org B must NOT be able to read Org A's job"

        # Org B attempts to list jobs
        org_b_jobs = await list_jobs(db, org_b.id, active=True)
        assert not any(j.id == saved_id for j in org_b_jobs), "Org B list must not contain Org A jobs"

        # Org B attempts to acknowledge Org A's job
        ack_result = await acknowledge(db, org_b.id, saved_id)
        assert ack_result is None, "Org B acknowledge of Org A job must return None"
        print(f"✓ [5.1] Cross-tenant access successfully blocked for Org B")

    # --------------------------------------------------------------------------
    # Scenario 6: Approval Workflow (Agent Flags -> Approvals Inbox -> Resume)
    # --------------------------------------------------------------------------
    banner("Scenario 6: Approvals Inbox Workflow")
    async with AsyncSessionLocal() as db:
        job_approval, _ = await submit_job(
            db,
            org_id=org_a.id,
            user_id=user_ops_id,
            job_type="quote_agent",
            input_data={"lead_id": lead_a.id},
            subject_type="lead",
            subject_id=lead_a.id,
        )
        await claim_job(db, job_approval.id)

        # Agent flags high discount and transitions to waiting_for_approval
        await _change_job(
            db,
            job_approval.id,
            status="waiting_for_approval",
            progress=100,
            message="Discount exceeds 20% threshold; pending manager sign-off",
            result={"discount_bps": 2500, "flag": "High discount policy exception"},
        )
        await db.refresh(job_approval)
        assert job_approval.status == "waiting_for_approval"
        print(f"✓ [6.1] Agent flagged approval: Status={job_approval.status}, Msg='{job_approval.message}'")

        # Approvals inbox lists it as active
        active_inbox = await list_jobs(db, org_a.id, user_id=user_ops_id, active=True)
        assert any(j.id == job_approval.id for j in active_inbox)
        print(f"✓ [6.2] Job present in active tenant jobs list ({len(active_inbox)} active jobs)")

        # Human manager approves the quote
        await complete(
            db,
            job_approval.id,
            result={"outcome": "approved", "quote_id": "quote-approved-999"},
            result_ref_type="quote",
            result_ref_id="quote-approved-999",
            message="Approved by sales manager",
        )
        await db.refresh(job_approval)
        assert job_approval.status == "completed"
        assert job_approval.result["outcome"] == "approved"
        print(f"✓ [6.3] Human decision recorded: Status={job_approval.status}, Outcome={job_approval.result['outcome']}")

    banner("ALL 6 END-TO-END WORKFLOW SCENARIOS VERIFIED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(main())
