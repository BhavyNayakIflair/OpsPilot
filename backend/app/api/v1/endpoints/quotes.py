import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.ai.jobs import job_manager
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_tenant
from app.gateway.base import LLMProvider, ProviderError
from app.gateway.factory import get_llm_provider
from app.models.organization import Organization
from app.models.crm import Lead, Contact, Company
from app.models.quotes import RateCard, Quote, QuoteLineItem
from app.schemas.quotes import QuoteCreate, QuoteDraftRequest, RateCardCreate
from app.services.quote_draft_service import generate_quote_draft
from app.services.quote_write_service import persist_quote

router = APIRouter()


async def _run_quote_draft_job(
    job_id: str,
    org_id: str,
    lead_id: str,
    rate_card_id: Optional[str],
    data_dict: dict,
    provider: LLMProvider,
):
    async with AsyncSessionLocal() as session:
        try:
            await job_manager.update_job(job_id, status="running", progress=20, message="Loading lead context and pricing sources")
            org = await session.scalar(select(Organization).where(Organization.id == org_id))
            lead = await session.scalar(select(Lead).where(Lead.id == lead_id, Lead.org_id == org_id))
            rate_card = await session.scalar(select(RateCard).where(RateCard.id == rate_card_id, RateCard.org_id == org_id)) if rate_card_id else None

            await job_manager.update_job(job_id, status="running", progress=50, message="Executing AI multi-provider routing (bounded to <=25s)")
            payload, assumptions, _evidence = await generate_quote_draft(
                session, org, lead, rate_card, provider,
                request=data_dict,
            )

            await job_manager.update_job(job_id, status="running", progress=85, message="Computing totals with Decimal and saving draft")
            quote = await persist_quote(session, org, payload, status="draft")

            await job_manager.update_job(
                job_id,
                status="completed",
                progress=100,
                message="Quote draft ready",
                result={"quote": quote, "assumptions": assumptions},
            )
        except Exception as exc:
            await job_manager.update_job(
                job_id,
                status="failed",
                progress=100,
                message=f"Drafting failed: {exc}",
                error=str(exc),
            )


@router.post("/draft-async", status_code=202)
async def draft_quote_async(
    data: QuoteDraftRequest,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    provider: LLMProvider = Depends(get_llm_provider),
):
    lead = await _owned(db, Lead, data.lead_id, org.id)
    if lead.status in ("won", "lost"):
        raise HTTPException(status_code=409, detail="Quotes can only be drafted for open leads")
    if data.rate_card_id:
        rate_card = await _owned(db, RateCard, data.rate_card_id, org.id)
    else:
        rate_card = await db.scalar(
            select(RateCard)
            .where(RateCard.org_id == org.id, RateCard.currency == lead.currency.upper())
            .order_by(RateCard.name)
        )
    currency = data.currency.upper() if data.currency else (rate_card.currency.upper() if rate_card else lead.currency.upper())
    if rate_card and currency != rate_card.currency.upper():
        raise HTTPException(status_code=422, detail="Quote currency must match its rate card")

    job_id = await job_manager.create_job(meta={"org_id": org.id, "lead_id": lead.id})
    request_data = {**data.model_dump(exclude={"lead_id", "rate_card_id"}), "currency": currency}

    asyncio.create_task(
        _run_quote_draft_job(
            job_id=job_id,
            org_id=org.id,
            lead_id=lead.id,
            rate_card_id=rate_card.id if rate_card else None,
            data_dict=request_data,
            provider=provider,
        )
    )

    return {"job_id": job_id, "status": "queued", "message": "Quote drafting initiated in background"}


@router.get("/draft-status/{job_id}")
async def get_draft_job_status(job_id: str, org: Organization = Depends(get_current_tenant)):
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Draft job not found")
    return job


@router.get("/draft-status/{job_id}/events")
async def get_draft_job_events(job_id: str, org: Organization = Depends(get_current_tenant)):
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Draft job not found")
    return StreamingResponse(
        job_manager.stream_job_events(job_id),
        media_type="text/event-stream",
    )


@router.get("/{quote_id}/draft-status")
async def get_quote_draft_status(
    quote_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    quote = await _owned(db, Quote, quote_id, org.id)
    return {"quote_id": quote.id, "status": quote.status, "updated_at": quote.updated_at}



async def _quote_out(db: AsyncSession, quote: Quote):
    lines = (await db.scalars(select(QuoteLineItem).where(QuoteLineItem.quote_id == quote.id, QuoteLineItem.org_id == quote.org_id))).all()
    return {**{c.name: getattr(quote, c.name) for c in Quote.__table__.columns}, "line_items": lines}


async def _owned(db, model, object_id, org_id):
    value = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if not value: raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return value


def _totals(lines, discount_bps, tax_bps):
    subtotal = sum(line.quantity * line.unit_price_cents for line in lines)
    discounted = (subtotal * (10000 - discount_bps) + 5000) // 10000
    total = discounted + (discounted * tax_bps + 5000) // 10000
    return subtotal, total


@router.post("/draft", status_code=201)
async def draft_quote(data: QuoteDraftRequest, org: Organization = Depends(get_current_tenant),
                      db: AsyncSession = Depends(get_db), provider: LLMProvider = Depends(get_llm_provider)):
    lead = await _owned(db, Lead, data.lead_id, org.id)
    if lead.status in ("won", "lost"):
        raise HTTPException(status_code=409, detail="Quotes can only be drafted for open leads")
    if data.rate_card_id:
        rate_card = await _owned(db, RateCard, data.rate_card_id, org.id)
    else:
        rate_card = await db.scalar(select(RateCard).where(
            RateCard.org_id == org.id, RateCard.currency == lead.currency.upper()
        ).order_by(RateCard.name))
    currency = data.currency.upper() if data.currency else (rate_card.currency.upper() if rate_card else lead.currency.upper())
    if rate_card and currency != rate_card.currency.upper():
        raise HTTPException(status_code=422, detail="Quote currency must match its rate card")
    try:
        payload, assumptions, _evidence = await generate_quote_draft(
            db, org, lead, rate_card, provider,
            request={**data.model_dump(exclude={"lead_id", "rate_card_id"}), "currency": currency}
        )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"AI quote draft failed: {exc}") from exc
    quote = await persist_quote(db, org, payload, status="draft")
    return {"quote": quote, "assumptions": assumptions}


@router.get("/rate-cards")
async def list_rate_cards(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(RateCard).where(RateCard.org_id == org.id).order_by(RateCard.name))).all()


@router.post("/rate-cards", status_code=201)
async def create_rate_card(data: RateCardCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = RateCard(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.put("/rate-cards/{rate_card_id}")
async def update_rate_card(rate_card_id: str, data: RateCardCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, RateCard, rate_card_id, org.id)
    if await db.scalar(select(Quote.id).where(Quote.org_id == org.id, Quote.rate_card_id == row.id).limit(1)):
        # Keep historical quote pricing and its source rate card immutable.
        raise HTTPException(status_code=409, detail="Rate cards linked to quotes cannot be changed")
    for key, value in data.model_dump().items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/rate-cards/{rate_card_id}", status_code=204)
async def delete_rate_card(rate_card_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, RateCard, rate_card_id, org.id)
    if await db.scalar(select(Quote.id).where(Quote.org_id == org.id, Quote.rate_card_id == row.id).limit(1)) or await db.scalar(select(QuoteLineItem.id).where(QuoteLineItem.org_id == org.id, QuoteLineItem.rate_card_id == row.id).limit(1)):
        raise HTTPException(status_code=409, detail="Rate cards used by quotes cannot be deleted")
    await db.delete(row); await db.commit()


@router.get("")
async def list_quotes(org: Organization = Depends       (get_current_tenant), db: AsyncSession = Depends(get_db)):
    quotes = (await db.scalars(select(Quote).where(Quote.org_id == org.id).order_by(Quote.created_at.desc()))).all()
    return [await _quote_out(db, quote) for quote in quotes]


@router.post("", status_code=201)
async def create_quote(data: QuoteCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return await persist_quote(db, org, data)


@router.get("/{quote_id}")
async def get_quote(quote_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return await _quote_out(db, await _owned(db, Quote, quote_id, org.id))


@router.put("/{quote_id}")
async def update_quote(quote_id: str, data: QuoteCreate, org: Organization = Depends(get_current_tenant),
                       db: AsyncSession = Depends(get_db)):
    quote = await _owned(db, Quote, quote_id, org.id)
    if quote.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft quotes can be edited")
    return await persist_quote(db, org, data, existing=quote)


@router.delete("/{quote_id}", status_code=204)
async def delete_quote(quote_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    quote = await _owned(db, Quote, quote_id, org.id)
    if quote.status == "accepted": raise HTTPException(status_code=409, detail="Accepted quotes cannot be deleted")
    await db.delete(quote); await db.commit()


@router.post("/calculate")
async def calculate_quote(data: QuoteCreate):
    subtotal, total = _totals(data.line_items, data.discount_bps, data.tax_bps)
    return {"subtotal_cents": subtotal, "total_cents": total, "currency": data.currency.upper()}


@router.get("/{quote_id}/pdf")
async def quote_pdf(quote_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    quote = await _owned(db, Quote, quote_id, org.id)
    lines = (await db.scalars(select(QuoteLineItem).where(QuoteLineItem.quote_id == quote.id, QuoteLineItem.org_id == org.id))).all()

    # Fetch related Lead → Contact → Company for richer PDF detail.
    lead_obj = None
    contact_obj = None
    company_obj = None
    if quote.lead_id:
        lead_obj = await db.scalar(select(Lead).where(Lead.id == quote.lead_id))
        if lead_obj:
            if lead_obj.contact_id:
                contact_obj = await db.scalar(select(Contact).where(Contact.id == lead_obj.contact_id))
            if lead_obj.company_id:
                company_obj = await db.scalar(select(Company).where(Company.id == lead_obj.company_id))

    from app.services.pdf_service import generate_quote_pdf
    pdf_bytes = generate_quote_pdf(
        org=org,
        quote=quote,
        lines=lines,
        generated_by="OpsPilot",
        lead=lead_obj,
        contact=contact_obj,
        company=company_obj,
    )
    return Response(pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="quote-{quote.id}.pdf"'})


@router.get("/accept/{token}")
async def accept_quote(token: str, db: AsyncSession = Depends(get_db)):
    quote = await db.scalar(select(Quote).where(Quote.accept_token == token))
    if not quote: raise HTTPException(status_code=404, detail="Acceptance link not found")
    if quote.status == "accepted": return {"id": quote.id, "status": quote.status, "accepted_at": quote.accepted_at}
    if quote.status in ("declined", "expired"): raise HTTPException(status_code=409, detail="This quote can no longer be accepted")
    quote.status = "accepted"; quote.accepted_at = datetime.now(timezone.utc)
    await db.commit(); await db.refresh(quote)
    return {"id": quote.id, "status": quote.status, "accepted_at": quote.accepted_at}
