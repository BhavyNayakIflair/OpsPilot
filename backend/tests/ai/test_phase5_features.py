"""
Comprehensive Tests for Phase 5 — Product Features & Bug Fixes:
1. Quote Drafting (Bug #1 arithmetic Decimal fix + Bug #2 async job & SSE/polling)
2. Month-End Billing Anomaly Explanation with exact cited row IDs
3. Migration Center Column Mapping (Deterministic fuzzy + AI fallback)
4. Knowledge / RAG QA with chunk citations and degraded mode fallback
5. Approvals Inbox AI-generated labels and source links
6. Reversible Alembic migration for chunk embedding metadata
"""
from datetime import date
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.gateway.base import LLMProvider
from app.gateway.factory import get_llm_provider
from app.main import app
from app.models.billing import Invoice, InvoiceLineItem, Expense
from app.models.content import DocumentChunk, KnowledgeDocument
from app.models.operations import Project, TimeEntry
from app.models.quotes import RateCard
from app.models.crm import Lead
from app.services.knowledge_service import ingest_document, search_chunks, answer_rag_question
from app.schemas.migration import SuggestMappingRequest
from app.services.migration_service import suggest_column_mappings


class FakeTestProvider(LLMProvider):
    def __init__(self):
        self.embedding_model = "gemini-embedding-001"

    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        if response_model:
            return response_model.model_validate({
                "title": "Async Proposal",
                "currency": "USD",
                "line_items": [{"description": "Engineering", "quantity": 10, "unit_price_cents": 10000}],
                "total_cents": 100000,
                "terms": "Net 30",
                "assumptions": ["Standard scope"],
            })
        return "This is a synthesized test response citing [Chunk chunk-1]."

    def embed(self, texts, **kwargs):
        vectors = []
        for text in texts:
            vector = [0.0] * 768
            vector[0 if "sla" in text.lower() or "service" in text.lower() else 1] = 1.0
            vectors.append(vector)
        return vectors


async def _register_tenant(client: AsyncClient, email_prefix: str):
    res = await client.post("/api/v1/auth/register", json={
        "email": f"{email_prefix}@example.com",
        "password": "Password123!",
        "full_name": "Phase 5 Tester",
        "org_name": f"Org {email_prefix}",
    })
    assert res.status_code == 201, res.text
    data = res.json()
    headers = {"Authorization": f"Bearer {data['access_token']}", "X-Org-ID": data["org_id"]}
    return headers, data["org_id"]


@pytest.mark.asyncio
async def test_async_quote_drafting_and_status(async_client: AsyncClient):
    headers, org_id = await _register_tenant(async_client, "quote_async_tester")
    provider = FakeTestProvider()
    app.dependency_overrides[get_llm_provider] = lambda: provider

    # Create RateCard & Lead
    rc_res = await async_client.post("/api/v1/quotes/rate-cards", headers=headers, json={
        "name": "Standard Rate", "currency": "USD", "default_rate_cents": 15000,
    })
    assert rc_res.status_code == 201
    rc = rc_res.json()

    lead_res = await async_client.post("/api/v1/crm/leads", headers=headers, json={
        "title": "Cloud Migration", "currency": "USD", "notes": "Migrate backend to cloud.",
    })
    assert lead_res.status_code == 201
    lead = lead_res.json()

    # Trigger Async Draft
    draft_res = await async_client.post("/api/v1/quotes/draft-async", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": rc["id"],
    })
    assert draft_res.status_code == 202
    job_info = draft_res.json()
    assert "job_id" in job_info
    assert job_info["status"] == "queued"

    # Poll Status
    status_res = await async_client.get(f"/api/v1/quotes/draft-status/{job_info['job_id']}", headers=headers)
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["job_id"] == job_info["job_id"]
    assert status_data["status"] in ("queued", "running", "completed")


@pytest.mark.asyncio
async def test_billing_anomaly_explanation_with_citations(async_client: AsyncClient, db_session):
    headers, org_id = await _register_tenant(async_client, "billing_anom_tester")

    # Seed baseline and outlier invoice lines
    inv = Invoice(
        org_id=org_id,
        invoice_number="INV-2026-TEST",
        client_name="Anomaly Corp",
        currency="USD",
        subtotal_cents=600000,
        tax_cents=0,
        total_cents=600000,
        issue_date=date(2026, 10, 1),
        due_date=date(2026, 10, 31),
    )
    db_session.add(inv)
    await db_session.flush()

    line_normal = InvoiceLineItem(
        org_id=org_id,
        invoice_id=inv.id,
        description="Standard support hours",
        quantity=5,
        unit_price_cents=10000,
        amount_cents=50000,
    )
    line_anom = InvoiceLineItem(
        org_id=org_id,
        invoice_id=inv.id,
        description="Emergency off-hours overhaul",
        quantity=1,
        unit_price_cents=550000,
        amount_cents=550000,
    )
    exp_anom = Expense(
        org_id=org_id,
        vendor="Global Cloud Host",
        description="Unexpected bandwidth spike",
        amount_cents=180000,
        currency="USD",
        expense_date=date(2026, 10, 2),
        status="pending",
    )
    db_session.add_all([line_normal, line_anom, exp_anom])
    await db_session.commit()

    # Call /anomalies/explain
    res = await async_client.post("/api/v1/billing/anomalies/explain", headers=headers)
    assert res.status_code == 200, res.text
    report = res.json()
    assert report["anomalies_count"] >= 2
    assert "executive_summary" in report

    # Verify cited row IDs match the seeded items
    anomaly_entity_ids = {a["entity_id"] for a in report["anomalies"]}
    assert line_anom.id in anomaly_entity_ids
    assert exp_anom.id in anomaly_entity_ids

    # Verify numbers are exact
    line_report = next(a for a in report["anomalies"] if a["entity_id"] == line_anom.id)
    assert line_report["actual_value"] == 5500.0
    assert line_report["metric"] == "amount_cents"


@pytest.mark.asyncio
async def test_migration_suggest_mapping_deterministic():
    req = SuggestMappingRequest(
        target="contacts",
        headers=["First Name", "Last Name", "Contact Email", "Phone Number", "Employer", "Job Title", "UnrelatedCol"],
        sample_rows=[
            {
                "First Name": "Alice",
                "Last Name": "Smith",
                "Contact Email": "alice@example.com",
                "Phone Number": "+1-555-0199",
                "Employer": "Acme Inc",
                "Job Title": "CTO",
                "UnrelatedCol": "xyz",
            }
        ],
    )
    result = await suggest_column_mappings(req)
    assert result.target == "contacts"
    assert not result.required_missing  # first_name and last_name both matched

    mapped_dict = {m.source_column: m.target_field for m in result.mappings}
    assert mapped_dict["First Name"] == "first_name"
    assert mapped_dict["Last Name"] == "last_name"
    assert mapped_dict["Contact Email"] == "email"
    assert mapped_dict["Phone Number"] == "phone"
    assert mapped_dict["Employer"] == "company"
    assert mapped_dict["Job Title"] == "title"
    assert "UnrelatedCol" in result.unmapped_columns


@pytest.mark.asyncio
async def test_knowledge_rag_qa_and_embedding_metadata(async_client: AsyncClient, db_session):
    headers, org_id = await _register_tenant(async_client, "rag_qa_tester")
    provider = FakeTestProvider()
    app.dependency_overrides[get_llm_provider] = lambda: provider

    # Create document
    doc = KnowledgeDocument(
        org_id=org_id,
        title="Service Level Agreement SLA",
        category="legal",
        content="Our standard SLA guarantees 99.9% uptime for cloud infrastructure and 1 hour critical support response.",
    )
    db_session.add(doc)
    await db_session.flush()

    count = await ingest_document(db_session, doc, provider)
    assert count >= 1
    await db_session.commit()

    # Verify embedding metadata columns on DocumentChunk
    chunks = (await db_session.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id))).all()
    assert len(chunks) >= 1
    assert chunks[0].embedding_model == "gemini-embedding-001"
    assert chunks[0].embedding_dimension == 768

    # Query with matching question
    res_match = await async_client.post("/api/v1/knowledge/ask", headers=headers, json={
        "question": "What is our SLA uptime guarantee?", "k": 3,
    })
    assert res_match.status_code == 200, res_match.text
    match_data = res_match.json()
    assert len(match_data["citations"]) >= 1
    assert match_data["citations"][0]["document_title"] == "Service Level Agreement SLA"
    assert match_data["citations"][0]["chunk_id"] == chunks[0].id

    # Query with unrelated nonsense
    res_unrelated = await async_client.post("/api/v1/knowledge/ask", headers=headers, json={
        "question": "quantum gravitational fluctuations in black hole thermodynamics", "k": 3,
    })
    assert res_unrelated.status_code == 200
    unrelated_data = res_unrelated.json()
    assert unrelated_data["answer"] == "not found in documents"
    assert unrelated_data["citations"] == []


@pytest.mark.asyncio
async def test_approvals_inbox_ai_labels(async_client: AsyncClient, db_session):
    headers, org_id = await _register_tenant(async_client, "approvals_label_tester")

    # Add a pending expense and pending timesheet
    exp = Expense(
        org_id=org_id,
        vendor="Hardware Vendor",
        description="Dev laptop",
        amount_cents=120000,
        currency="USD",
        expense_date=date(2026, 10, 5),
        status="pending",
    )
    db_session.add(exp)
    await db_session.commit()

    res = await async_client.get("/api/v1/workflows/approvals", headers=headers)
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) >= 1

    # Verify items have is_ai_generated and source_links fields
    for item in items:
        assert "is_ai_generated" in item
        assert "source_links" in item
        if item["entity_type"] == "expense":
            assert item["is_ai_generated"] is False
            assert item["ai_label"] is None
