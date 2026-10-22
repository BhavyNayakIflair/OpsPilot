from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.base import LLMProvider
from app.models.content import WorkflowRun
from app.models.job import BackgroundJob
from app.services.job_service import set_progress
from app.services.quote_agent_service import execute_quote_agent


async def handle_quote_agent(
    db: AsyncSession,
    job: BackgroundJob,
    provider: LLMProvider,
) -> dict[str, Any]:
    run_id = job.workflow_run_id
    if not run_id:
        raise LookupError("The quote agent run is no longer available.")
    run = await db.scalar(select(WorkflowRun).where(
        WorkflowRun.id == run_id,
        WorkflowRun.org_id == job.org_id,
    ))
    if not run:
        raise LookupError("The quote agent run is no longer available.")

    state = {
        "run_id": run.id,
        "org_id": job.org_id,
        "user_id": run.user_id or "",
        "lead_id": run.input_data["lead_id"],
        "rate_card_id": run.input_data.get("rate_card_id"),
        "quote_request": run.input_data.get("quote_request", {}),
    }

    async def progress(percent: int, message: str) -> None:
        await set_progress(db, job.id, percent, message)

    await execute_quote_agent(db, provider, state, progress_cb=progress, recover=bool(job.input.get("recover")))
    await db.refresh(run)
    result = run.result_data or {}
    if run.status == "paused_for_approval":
        return {
            "status": "waiting_for_approval",
            "message": "Waiting for quote approval",
            "result": result,
        }
    if run.status == "failed":
        raise RuntimeError(result.get("error", "The quote agent could not complete this run."))
    if run.status == "rejected":
        return {"result": {"outcome": "rejected", **result}}
    return {
        "result": result,
        "result_ref_type": "quote" if result.get("quote_id") else None,
        "result_ref_id": result.get("quote_id"),
    }
