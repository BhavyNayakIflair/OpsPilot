from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.base import LLMProvider
from app.models.crm import Lead
from app.models.job import BackgroundJob
from app.models.organization import Organization
from app.models.quotes import Quote, QuoteLineItem, RateCard
from app.schemas.quotes import QuoteDraftRequest
from app.services.job_service import set_progress
from app.services.quote_draft_service import generate_quote_draft
from app.services.quote_write_service import persist_quote


async def _existing_quote_result(db: AsyncSession, job: BackgroundJob) -> dict[str, Any] | None:
    if not job.result_ref_id:
        return None
    quote = await db.scalar(select(Quote).where(
        Quote.id == job.result_ref_id,
        Quote.org_id == job.org_id,
    ))
    if not quote:
        return None
    line_items = (await db.scalars(select(QuoteLineItem).where(
        QuoteLineItem.quote_id == quote.id,
        QuoteLineItem.org_id == job.org_id,
    ))).all()
    return {
        "result": {
            "quote": jsonable_encoder({
                **{column.name: getattr(quote, column.name) for column in Quote.__table__.columns},
                "line_items": line_items,
            }),
            "assumptions": (job.result or {}).get("assumptions", []),
            "provider": (job.result or {}).get("provider", "unknown"),
            "is_degraded": (job.result or {}).get("is_degraded", False),
        },
        "result_ref_type": "quote",
        "result_ref_id": quote.id,
    }


async def handle_quote_draft(
    db: AsyncSession,
    job: BackgroundJob,
    provider: LLMProvider,
) -> dict[str, Any]:
    existing = await _existing_quote_result(db, job)
    if existing:
        return existing

    request_data = dict(job.input)
    lead_id = request_data.pop("lead_id")
    rate_card_id = request_data.pop("rate_card_id", None)
    await set_progress(db, job.id, 10, "Loading lead and pricing context")
    org = await db.scalar(select(Organization).where(Organization.id == job.org_id))
    lead = await db.scalar(select(Lead).where(Lead.id == lead_id, Lead.org_id == job.org_id))
    if not org or not lead:
        raise LookupError("Lead is no longer available in this organization")
    rate_card = None
    if rate_card_id:
        rate_card = await db.scalar(select(RateCard).where(
            RateCard.id == rate_card_id,
            RateCard.org_id == job.org_id,
        ))
        if not rate_card:
            raise LookupError("Rate card is no longer available in this organization")
    else:
        rate_card = await db.scalar(select(RateCard).where(
            RateCard.org_id == job.org_id,
            RateCard.currency == lead.currency.upper(),
        ).order_by(RateCard.name))

    await set_progress(db, job.id, 20, "Generating draft with AI")
    normalized_request = QuoteDraftRequest.model_validate({
        "lead_id": lead_id,
        "rate_card_id": rate_card.id if rate_card else None,
        **request_data,
    })
    payload, assumptions, _evidence = await generate_quote_draft(
        db,
        org,
        lead,
        rate_card,
        provider,
        request={
            **normalized_request.model_dump(exclude={"lead_id", "rate_card_id"}),
            "currency": normalized_request.currency or (rate_card.currency if rate_card else lead.currency),
        },
    )
    await set_progress(db, job.id, 90, "Saving draft")
    quote = await persist_quote(db, org, payload, status="draft", commit=False)
    provider_id = getattr(provider, "provider_id", "auto")
    is_degraded = getattr(provider, "is_degraded", False) or provider_id in ("ollama", "mock")
    return {
        "result": jsonable_encoder({
            "quote": quote,
            "assumptions": assumptions,
            "provider": provider_id,
            "is_degraded": is_degraded,
        }),
        "result_ref_type": "quote",
        "result_ref_id": quote["id"],
    }
