from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm import Lead
from app.models.organization import Organization
from app.models.quotes import Quote, QuoteLineItem, RateCard
from app.schemas.quotes import QuoteCreate


async def persist_quote(db: AsyncSession, org: Organization, data: QuoteCreate,
                        status: str = "draft", existing: Quote | None = None) -> dict:
    card = await _owned(db, RateCard, data.rate_card_id, org.id) if data.rate_card_id else None
    if card and card.currency.upper() != data.currency.upper():
        raise HTTPException(status_code=422, detail="Quote currency must match its rate card")
    if data.lead_id:
        await _owned(db, Lead, data.lead_id, org.id)
    for item in data.line_items:
        if item.rate_card_id:
            await _owned(db, RateCard, item.rate_card_id, org.id)
    subtotal, total = _totals(data.line_items, data.discount_bps, data.tax_bps)
    if existing is None:
        quote = Quote(org_id=org.id, status=status)
        db.add(quote)
    else:
        quote = existing
        await db.execute(delete(QuoteLineItem).where(
            QuoteLineItem.quote_id == quote.id, QuoteLineItem.org_id == org.id
        ))
    quote.rate_card_id = data.rate_card_id
    quote.lead_id = data.lead_id
    quote.title = data.title
    quote.currency = data.currency.upper()
    quote.discount_bps = data.discount_bps
    quote.tax_bps = data.tax_bps
    quote.subtotal_cents = subtotal
    quote.total_cents = total
    quote.terms = data.terms
    await db.flush()
    for item in data.line_items:
        db.add(QuoteLineItem(org_id=org.id, quote_id=quote.id, **item.model_dump(),
                             amount_cents=item.quantity * item.unit_price_cents))
    await db.commit()
    await db.refresh(quote)
    lines = (await db.scalars(select(QuoteLineItem).where(
        QuoteLineItem.quote_id == quote.id, QuoteLineItem.org_id == quote.org_id
    ))).all()
    return {**{column.name: getattr(quote, column.name) for column in Quote.__table__.columns},
            "line_items": lines}


async def _owned(db: AsyncSession, model, object_id: str, org_id: str):
    value = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if not value:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return value


def _totals(lines, discount_bps: int, tax_bps: int) -> tuple[int, int]:
    subtotal = sum(line.quantity * line.unit_price_cents for line in lines)
    discounted = (subtotal * (10000 - discount_bps) + 5000) // 10000
    total = discounted + (discounted * tax_bps + 5000) // 10000
    return subtotal, total
