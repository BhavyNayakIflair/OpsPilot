from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant
from app.gateway.base import LLMProvider, ProviderError
from app.gateway.factory import get_llm_provider
from app.models.organization import Organization
from app.models.crm import Lead
from app.models.quotes import RateCard, Quote, QuoteLineItem
from app.schemas.quotes import QuoteCreate, QuoteDraftRequest, RateCardCreate
from app.services.quote_draft_service import generate_quote_draft
from app.services.quote_write_service import persist_quote

router = APIRouter()


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
    if rate_card and rate_card.currency.upper() != lead.currency.upper():
        raise HTTPException(status_code=422, detail="Rate card currency must match the lead currency")
    try:
        payload, assumptions, _evidence = await generate_quote_draft(db, org, lead, rate_card, provider)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"AI quote draft could not be validated: {exc}") from exc
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
async def list_quotes(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
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
    # Generate a small standards-compliant one-page PDF without an external runtime dependency.
    text_lines = [f"Quote: {quote.title}", f"Status: {quote.status}", f"Total: {quote.currency} {quote.total_cents / 100:.2f}"]
    text_lines += [f"{line.description}  x{line.quantity}  {line.currency if hasattr(line, 'currency') else quote.currency} {line.amount_cents / 100:.2f}" for line in lines]
    stream = "BT /F1 12 Tf 50 790 Td " + " ".join(f"({s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')}) Tj 0 -22 Td" for s in text_lines) + " ET"
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", f"<< /Length {len(stream.encode())} >>\nstream\n{stream}\nendstream".encode()]
    pdf = bytearray(b"%PDF-1.4\n"); offsets = [0]
    for i, obj in enumerate(objects, 1): offsets.append(len(pdf)); pdf.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(pdf); pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]: pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return Response(bytes(pdf), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="quote-{quote.id}.pdf"'})


@router.get("/accept/{token}")
async def accept_quote(token: str, db: AsyncSession = Depends(get_db)):
    quote = await db.scalar(select(Quote).where(Quote.accept_token == token))
    if not quote: raise HTTPException(status_code=404, detail="Acceptance link not found")
    if quote.status == "accepted": return {"id": quote.id, "status": quote.status, "accepted_at": quote.accepted_at}
    if quote.status in ("declined", "expired"): raise HTTPException(status_code=409, detail="This quote can no longer be accepted")
    quote.status = "accepted"; quote.accepted_at = datetime.now(timezone.utc)
    await db.commit(); await db.refresh(quote)
    return {"id": quote.id, "status": quote.status, "accepted_at": quote.accepted_at}
