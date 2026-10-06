from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_tenant
from app.gateway.base import LLMProvider, ProviderError
from app.gateway.factory import get_llm_provider
from app.models.organization import Organization
from pydantic import BaseModel, Field
from app.services.knowledge_service import search_chunks, answer_rag_question

router = APIRouter()


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    k: int = Field(default=5, ge=1, le=20)


@router.get("/search")
async def search_knowledge(
    q: str = Query(min_length=1, max_length=4000),
    k: int = Query(default=5, ge=1, le=20),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    provider: LLMProvider = Depends(get_llm_provider),
):
    if not q.strip():
        raise HTTPException(status_code=422, detail="Search query must contain non-whitespace text")
    try:
        results = await search_chunks(org.id, q.strip(), k, db, provider)
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=f"Knowledge search is unavailable: {exc}") from exc
    return [{
        "content": result.chunk.content,
        "chunk_index": result.chunk.chunk_index,
        "document": {"id": result.document_id, "title": result.document_title},
        "relevance_score": result.relevance_score,
    } for result in results]


@router.post("/ask")
async def ask_knowledge(
    data: QuestionRequest,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    provider: LLMProvider = Depends(get_llm_provider),
):
    if not data.question.strip():
        raise HTTPException(status_code=422, detail="Question must contain non-whitespace text")
    try:
        return await answer_rag_question(org.id, data.question.strip(), db, provider, k=data.k)
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=f"Knowledge QA unavailable: {exc}") from exc
