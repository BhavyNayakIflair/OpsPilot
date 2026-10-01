from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_tenant
from app.gateway.base import ProviderError
from app.gateway.factory import get_provider
from app.models.organization import Organization
from app.services.knowledge_service import search_chunks

router = APIRouter()


@router.get("/search")
async def search_knowledge(
    q: str = Query(min_length=1, max_length=4000),
    k: int = Query(default=5, ge=1, le=20),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    if not q.strip():
        raise HTTPException(status_code=422, detail="Search query must contain non-whitespace text")
    try:
        results = await search_chunks(org.id, q.strip(), k, db, get_provider())
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=f"Knowledge search is unavailable: {exc}") from exc
    return [{
        "content": result.chunk.content,
        "chunk_index": result.chunk.chunk_index,
        "document": {"id": result.document_id, "title": result.document_title},
        "relevance_score": result.relevance_score,
    } for result in results]
