import asyncio
import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.base import LLMProvider, ProviderError
from app.models.quotes import Quote, QuoteLineItem


async def find_similar_quotes(db: AsyncSession, org_id: str, query: str, currency: str,
                              provider: LLMProvider, k: int = 3) -> list[dict]:
    """Rank a bounded set of accepted same-currency quotes using Phase 2's embedding provider."""
    quotes = (await db.scalars(
        select(Quote).where(Quote.org_id == org_id, Quote.status == "accepted", Quote.currency == currency)
        .order_by(Quote.created_at.desc()).limit(30)
    )).all()
    if not quotes or k < 1:
        return []
    quote_ids = [quote.id for quote in quotes]
    lines = (await db.scalars(
        select(QuoteLineItem).where(QuoteLineItem.org_id == org_id, QuoteLineItem.quote_id.in_(quote_ids))
    )).all()
    lines_by_quote: dict[str, list[QuoteLineItem]] = {}
    for line in lines:
        lines_by_quote.setdefault(line.quote_id, []).append(line)
    representations = [
        f"{quote.title}\n" + "\n".join(
            f"{line.description}; quantity {line.quantity}; unit price {line.unit_price_cents} cents"
            for line in lines_by_quote.get(quote.id, [])
        )
        for quote in quotes
    ]
    vectors = await asyncio.to_thread(provider.embed, [query, *representations],
                                      task_type="quote_retrieval", org_id=org_id)
    if len(vectors) != len(representations) + 1 or any(len(vector) != 768 for vector in vectors):
        raise ProviderError("Embedding provider returned invalid vectors while retrieving past quotes")
    query_vector = vectors[0]
    ranked: list[tuple[float, Quote, list[QuoteLineItem]]] = []
    for quote, vector in zip(quotes, vectors[1:]):
        score = _cosine_similarity(query_vector, vector)
        if score >= 0.35:
            ranked.append((score, quote, lines_by_quote.get(quote.id, [])))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [{
        "title": quote.title,
        "currency": quote.currency,
        "line_items": [{"description": line.description, "quantity": line.quantity,
                        "unit_price_cents": line.unit_price_cents} for line in quote_lines],
        "terms": quote.terms,
        "relevance_score": round(score, 4),
    } for score, quote, quote_lines in ranked[:k]]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm)
