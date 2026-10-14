import pytest
from sqlalchemy import select

from app.gateway.base import LLMProvider
from app.models.content import DocumentChunk, KnowledgeDocument
from app.models.organization import Organization
from app.services.knowledge_service import answer_rag_question, chunk_text, ingest_document, search_chunks


class FakeProvider(LLMProvider):
    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        return "unused"

    def embed(self, texts, **kwargs):
        vectors = []
        for text in texts:
            vector = [0.0] * 768
            vector[0 if "contract" in text.lower() else 1] = 1.0
            vectors.append(vector)
        return vectors


async def _document(db_session, title, content):
    org = Organization(name=title, slug=f"{title.lower()}-{len(content)}")
    db_session.add(org)
    await db_session.flush()
    document = KnowledgeDocument(org_id=org.id, title=title, category="general", content=content)
    db_session.add(document)
    await db_session.flush()
    return org, document


@pytest.mark.asyncio
async def test_ingestion_chunks_and_stores_768_dimensions(db_session):
    provider = FakeProvider()
    org, document = await _document(db_session, "Long contract", "contract terms " * 180)
    expected = chunk_text(document.content)

    count = await ingest_document(db_session, document, provider)
    stored = (await db_session.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id))).all()

    assert count == len(expected)
    assert len(stored) == len(expected)
    assert all(len(chunk.embedding) == 768 for chunk in stored)
    assert {chunk.chunk_index for chunk in stored} == set(range(len(expected)))


@pytest.mark.asyncio
async def test_search_is_org_scoped_and_filters_unrelated_queries(db_session):
    provider = FakeProvider()
    org_a, document_a = await _document(db_session, "Tenant A contract", "contract payment and delivery terms")
    org_b, document_b = await _document(db_session, "Tenant B contract", "contract payment and delivery terms")
    await ingest_document(db_session, document_a, provider)
    await ingest_document(db_session, document_b, provider)
    await db_session.commit()

    results = await search_chunks(org_a.id, "contract payment terms", 5, db_session, provider)
    nonsense = await search_chunks(org_a.id, "unrelated gibberish", 5, db_session, provider)

    assert results
    assert {result.document_id for result in results} == {document_a.id}
    assert not nonsense


@pytest.mark.asyncio
async def test_blank_queries_short_circuit_cleanly(db_session):
    provider = FakeProvider()
    org, _ = await _document(db_session, "Tenant blank check", "contract clauses for internal review")

    assert await search_chunks(org.id, "   ", 5, db_session, provider) == []
    assert await answer_rag_question(org.id, "   ", db_session, provider) == {
        "answer": "not found in documents",
        "citations": [],
        "degraded": False,
    }


class AnsweringProvider(FakeProvider):
    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        return "Payment is due within 30 days of invoice [Chunk cited]."

    def embed(self, texts, **kwargs):
        return [[1.0] + [0.0] * 767 for _ in texts]


@pytest.mark.asyncio
async def test_rag_answer_uses_provider_and_does_not_dump_full_document(db_session):
    provider = AnsweringProvider()
    full_document = "CONTRACT FILE\n" + ("payment terms thirty days net. " * 80)
    org, document = await _document(db_session, "Master services agreement", full_document)
    await ingest_document(db_session, document, provider)
    await db_session.commit()

    result = await answer_rag_question(org.id, "What are the payment terms?", db_session, provider)

    assert result["answer"] == "Payment is due within 30 days of invoice [Chunk cited]."
    assert "CONTRACT FILE" not in result["answer"]
    assert full_document not in result["answer"]
    assert result["citations"]
    assert result["citations"][0]["document_title"] == "Master services agreement"
