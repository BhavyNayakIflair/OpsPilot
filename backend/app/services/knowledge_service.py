import asyncio
import math
from datetime import datetime, timezone
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.base import LLMProvider, ProviderError
from app.models.content import DocumentChunk, KnowledgeDocument
from app.models.base import generate_uuid

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200
EMBEDDING_DIMENSION = 768
MIN_RELEVANCE = 0.35


@dataclass
class ChunkResult:
    chunk: DocumentChunk
    document_id: str
    document_title: str
    relevance_score: float


def chunk_text(content: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into bounded overlapping windows, preferring whitespace boundaries."""
    source = content.strip()
    if not source:
        return []
    if size <= 0 or overlap < 0 or overlap >= size:
        raise ValueError("Chunk size must be positive and overlap must be smaller than size")
    chunks: list[str] = []
    start = 0
    while start < len(source):
        end = min(start + size, len(source))
        if end < len(source):
            boundary = source.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunk = source[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(source):
            break
        start = max(start + 1, end - overlap)
        while start < len(source) and source[start].isspace():
            start += 1
    return chunks


async def ingest_document(db: AsyncSession, document: KnowledgeDocument, provider: LLMProvider) -> int:
    chunks = chunk_text(document.content)
    if not chunks:
        return 0
    vectors: list[list[float]] = []
    # Keep individual embed requests bounded for CPU-only local inference.
    for offset in range(0, len(chunks), 32):
        batch = chunks[offset:offset + 32]
        embedded = await asyncio.to_thread(provider.embed, batch, task_type="document_ingestion", org_id=document.org_id)
        if len(embedded) != len(batch):
            raise ProviderError("Embedding provider returned a different number of vectors than input chunks")
        if any(len(vector) != EMBEDDING_DIMENSION for vector in embedded):
            raise ProviderError(f"Embedding provider must return {EMBEDDING_DIMENSION}-dimensional vectors")
        vectors.extend(embedded)
    if db.get_bind().dialect.name == "postgresql" and await _postgres_has_vector_column(db):
        now = datetime.now(timezone.utc)
        for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
            await db.execute(text("""
                INSERT INTO document_chunks
                    (id, document_id, org_id, content, embedding, chunk_index, created_at, updated_at)
                VALUES (:id, :document_id, :org_id, :content, CAST(:embedding AS vector), :chunk_index, :created_at, :updated_at)
            """), {"id": generate_uuid(), "document_id": document.id, "org_id": document.org_id,
                  "content": chunk, "embedding": _vector_literal(vector), "chunk_index": index,
                  "created_at": now, "updated_at": now})
    else:
        db.add_all([
            DocumentChunk(org_id=document.org_id, document_id=document.id, content=chunk,
                          embedding=vector, chunk_index=index)
            for index, (chunk, vector) in enumerate(zip(chunks, vectors))
        ])
    await db.flush()
    return len(chunks)


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm)


async def search_chunks(org_id: str, query: str, k: int, db: AsyncSession,
                        provider: LLMProvider) -> list[ChunkResult]:
    if k < 1:
        return []
    query_vectors = await asyncio.to_thread(provider.embed, [query], task_type="knowledge_search", org_id=org_id)
    if len(query_vectors) != 1 or len(query_vectors[0]) != EMBEDDING_DIMENSION:
        raise ProviderError("Embedding provider returned an invalid query vector; expected 768 dimensions")
    query_vector = query_vectors[0]

    if db.get_bind().dialect.name == "postgresql" and await _postgres_has_vector_column(db):
        # The migration installs pgvector and promotes the bootstrap TEXT column to vector(768).
        rows = (await db.execute(text("""
            SELECT c.id, c.document_id, c.org_id, c.content, c.chunk_index,
                   d.title AS document_title, (c.embedding <=> CAST(:query_vector AS vector)) AS distance
            FROM document_chunks c
            JOIN knowledge_documents d ON d.id = c.document_id AND d.org_id = c.org_id
            WHERE c.org_id = :org_id
            ORDER BY c.embedding <=> CAST(:query_vector AS vector)
            LIMIT :limit
        """), {"query_vector": _vector_literal(query_vector), "org_id": org_id, "limit": k})).mappings().all()
        return [ChunkResult(
            chunk=DocumentChunk(id=row["id"], document_id=row["document_id"], org_id=row["org_id"],
                                content=row["content"], chunk_index=row["chunk_index"]),
            document_id=row["document_id"], document_title=row["document_title"],
            relevance_score=1.0 - float(row["distance"]),
        ) for row in rows if 1.0 - float(row["distance"]) >= MIN_RELEVANCE]

    pairs = (await db.execute(
        select(DocumentChunk, KnowledgeDocument)
        .join(KnowledgeDocument, KnowledgeDocument.id == DocumentChunk.document_id)
        .where(DocumentChunk.org_id == org_id, KnowledgeDocument.org_id == org_id)
    )).all()
    ranked = []
    for chunk, document in pairs:
        score = _cosine_similarity(query_vector, chunk.embedding)
        if score >= MIN_RELEVANCE:
            ranked.append(ChunkResult(chunk, document.id, document.title, score))
    ranked.sort(key=lambda result: result.relevance_score, reverse=True)
    return ranked[:k]


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in vector) + "]"


async def _postgres_has_vector_column(db: AsyncSession) -> bool:
    result = await db.execute(text("""
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'document_chunks' AND column_name = 'embedding'
    """))
    return result.scalar_one_or_none() == "vector"
