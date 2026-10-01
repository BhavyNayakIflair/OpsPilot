import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user
from app.models.organization import Organization
from app.models.user import User
from app.models.content import KnowledgeDocument
from app.gateway.base import ProviderError
from app.gateway.factory import get_provider
from app.services.knowledge_service import ingest_document, search_chunks

logger = logging.getLogger(__name__)

router = APIRouter()


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    category: str = "general"
    content: str = Field(min_length=1)


@router.get("")
async def list_documents(q: str = "", org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    query = select(KnowledgeDocument).where(KnowledgeDocument.org_id == org.id)
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.where(KnowledgeDocument.title.ilike(term) | KnowledgeDocument.content.ilike(term))
    return (await db.scalars(query.order_by(KnowledgeDocument.updated_at.desc()))).all()


@router.post("", status_code=201)
async def create_document(data: DocumentCreate, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    if len(data.content.encode("utf-8")) > 2 * 1024 * 1024: raise HTTPException(status_code=413, detail="Document text must be 2 MB or smaller")
    row = KnowledgeDocument(org_id=org.id, uploaded_by=user.id, **data.model_dump()); db.add(row); await db.flush()
    try:
        await ingest_document(db, row, get_provider())
    except ProviderError as exc:
        # Document creation remains available during model downtime; indexing can be retried later.
        logger.warning("Document %s saved without vector ingestion: %s", row.id, exc)
    await db.commit(); await db.refresh(row); return row


@router.get("/{document_id}")
async def get_document(document_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.id == document_id, KnowledgeDocument.org_id == org.id))
    if not row: raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.id == document_id, KnowledgeDocument.org_id == org.id))
    if not row: raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(row); await db.commit()
