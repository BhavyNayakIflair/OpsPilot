import pytest
from fastapi import HTTPException

from app.models.organization import Organization
from app.services.job_service import claim_job, complete, submit_job


@pytest.mark.asyncio
async def test_submit_job_deduplicates_active_fingerprint(db_session):
    org = Organization(name="Job tests", slug="job-tests")
    db_session.add(org)
    await db_session.commit()

    first, deduplicated = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-1"},
    )
    second, second_deduplicated = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-1"},
    )

    assert not deduplicated
    assert second_deduplicated
    assert second.id == first.id


@pytest.mark.asyncio
async def test_idempotency_key_rejects_changed_payload(db_session):
    org = Organization(name="Idempotency tests", slug="idempotency-tests")
    db_session.add(org)
    await db_session.commit()
    await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-1"},
        idempotency_key="click-intent-1",
    )

    with pytest.raises(HTTPException) as error:
        await submit_job(
            db_session,
            org_id=org.id,
            user_id=None,
            job_type="quote_draft",
            input_data={"lead_id": "lead-2"},
            idempotency_key="click-intent-1",
        )
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_job_claim_is_atomic_and_completion_is_terminal(db_session):
    org = Organization(name="Claim tests", slug="claim-tests")
    db_session.add(org)
    await db_session.commit()
    job, _ = await submit_job(
        db_session,
        org_id=org.id,
        user_id=None,
        job_type="quote_draft",
        input_data={"lead_id": "lead-1"},
    )

    assert await claim_job(db_session, job.id)
    assert not await claim_job(db_session, job.id)
    await complete(db_session, job.id, {"quote": {"line_items": []}})
    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.result == {"quote": {"line_items": []}}
