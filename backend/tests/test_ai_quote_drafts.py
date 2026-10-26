import pytest
from httpx import AsyncClient

from app.gateway.base import LLMProvider
from app.gateway.factory import get_llm_provider
from app.main import app


class FakeProvider(LLMProvider):
    def __init__(self, malformed=False):
        self.malformed = malformed
        self.prompts = []

    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        self.prompts.append(prompt)
        if self.malformed:
            return "this is not valid JSON"
        return response_model.model_validate({
            "title": "Website implementation proposal",
            "currency": "USD",
            "line_items": [{"description": "Implementation", "quantity": 2, "unit_price_cents": 15000}],
            "total_cents": 30000,
            "terms": None,
            "assumptions": ["Scope is based on the lead notes."],
        })

    def embed(self, texts, **kwargs):
        return [[1.0] + [0.0] * 767 for _ in texts]


class RewriteProvider(FakeProvider):
    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        self.prompts.append(prompt)
        return response_model.model_validate({
            "title": "Vending Machine Platform Development",
            "description": "Design and develop the vending machine platform, including the backend, customer-facing landing page, location experience, and an interactive GSAP website.",
            "currency": "USD",
            "line_items": [
                {"description": "Implementation", "quantity": 1, "unit_price_cents": 50000},
            ],
            "terms": "Payment is due in three milestones: 50% as an advance, 40% upon completion, and 10% one year after completion.",
            "assumptions": [],
        })


async def _setup_lead_and_card(client: AsyncClient, suffix: str):
    registered = await client.post("/api/v1/auth/register", json={
        "email": f"ai_quote_{suffix}@example.com", "password": "Password123!",
        "full_name": "AI Quote Owner", "org_name": f"AI Quote Org {suffix}",
    })
    assert registered.status_code == 201
    payload = registered.json()
    headers = {"Authorization": f"Bearer {payload['access_token']}", "X-Org-ID": payload["org_id"]}
    card = await client.post("/api/v1/quotes/rate-cards", headers=headers, json={
        "name": "Standard", "currency": "USD", "default_rate_cents": 15000,
    })
    assert card.status_code == 201
    lead = await client.post("/api/v1/crm/leads", headers=headers, json={
        "title": "Website implementation", "currency": "USD", "notes": "Build a customer portal.",
    })
    assert lead.status_code == 201
    return headers, card.json(), lead.json()


@pytest.mark.asyncio
async def test_ai_quote_draft_is_saved_for_review(async_client: AsyncClient):
    headers, card, lead = await _setup_lead_and_card(async_client, "valid")
    provider = FakeProvider()
    app.dependency_overrides[get_llm_provider] = lambda: provider

    response = await async_client.post("/api/v1/quotes/draft", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": card["id"],
    })

    assert response.status_code == 201, response.text
    result = response.json()
    assert result["quote"]["status"] == "draft"
    assert result["quote"]["total_cents"] == 30000
    assert result["quote"]["line_items"][0]["unit_price_cents"] == 15000
    assert result["assumptions"] == ["Scope is based on the lead notes."]
    assert "default_rate_cents" in provider.prompts[0]


@pytest.mark.asyncio
async def test_ai_quote_draft_rewrites_proposal_metadata_from_line_items(async_client: AsyncClient):
    headers, card, lead = await _setup_lead_and_card(async_client, "rewrite")
    provider = RewriteProvider()
    app.dependency_overrides[get_llm_provider] = lambda: provider

    response = await async_client.post("/api/v1/quotes/draft", headers=headers, json={
        "lead_id": lead["id"],
        "rate_card_id": card["id"],
        "title": "",
        "description": "vending machine stuff",
        "terms": "50% advance and 40% after completion and 10% after 1 year",
        "line_items": [{"description": "Vending machine backend", "quantity": 1, "unit_price_cents": 50000}],
    })

    assert response.status_code == 201, response.text
    quote = response.json()["quote"]
    assert quote["title"] == "Vending Machine Platform Development"
    assert quote["description"].startswith("Design and develop")
    assert quote["terms"].startswith("Payment is due in three milestones")
    assert lead["title"] not in provider.prompts[0]
    assert "derived from the requested line items" in provider.prompts[0]


@pytest.mark.asyncio
async def test_malformed_ai_quote_is_reported_and_not_saved(async_client: AsyncClient):
    headers, card, lead = await _setup_lead_and_card(async_client, "malformed")
    app.dependency_overrides[get_llm_provider] = lambda: FakeProvider(malformed=True)

    response = await async_client.post("/api/v1/quotes/draft", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": card["id"],
    })

    assert response.status_code == 502
    assert "could not be validated" in response.json()["detail"]
    quotes = await async_client.get("/api/v1/quotes", headers=headers)
    assert quotes.status_code == 200 and quotes.json() == []


class MismatchedMathProvider(FakeProvider):
    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        # Model hallucinated 999999 as total_cents
        return response_model.model_validate({
            "title": "Website proposal",
            "currency": "USD",
            "line_items": [{"description": "Implementation", "quantity": 3, "unit_price_cents": 15000}],
            "total_cents": 999999,
            "terms": None,
            "assumptions": [],
        })


@pytest.mark.asyncio
async def test_ai_quote_draft_computes_total_with_decimal_when_model_total_differs(async_client: AsyncClient):
    headers, card, lead = await _setup_lead_and_card(async_client, "math_fix")
    app.dependency_overrides[get_llm_provider] = lambda: MismatchedMathProvider()

    response = await async_client.post("/api/v1/quotes/draft", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": card["id"],
    })

    assert response.status_code == 201
    result = response.json()
    # Correct code computed 3 * 15000 = 45000 with Decimal, ignoring model 999999
    assert result["quote"]["total_cents"] == 45000


@pytest.mark.asyncio
async def test_ai_quote_draft_allows_won_leads_but_rejects_lost(async_client: AsyncClient):
    headers, card, lead = await _setup_lead_and_card(async_client, "closed_status")
    app.dependency_overrides[get_llm_provider] = lambda: FakeProvider()
    stages = await async_client.get("/api/v1/crm/stages", headers=headers)
    won_stage = next(stage for stage in stages.json() if stage["is_won"])
    lost_stage = next(stage for stage in stages.json() if stage["is_lost"])

    won = await async_client.patch(
        f"/api/v1/crm/leads/{lead['id']}", headers=headers, json={"stage_id": won_stage["id"]}
    )
    assert won.status_code == 200 and won.json()["status"] == "won"
    won_draft = await async_client.post("/api/v1/quotes/draft", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": card["id"],
    })
    assert won_draft.status_code == 201, won_draft.text

    lost_lead = await async_client.post("/api/v1/crm/leads", headers=headers, json={
        "title": "Cancelled engagement", "currency": "USD", "stage_id": lost_stage["id"],
    })
    assert lost_lead.status_code == 201 and lost_lead.json()["status"] == "lost"
    lost_draft = await async_client.post("/api/v1/quotes/draft", headers=headers, json={
        "lead_id": lost_lead.json()["id"], "rate_card_id": card["id"],
    })
    assert lost_draft.status_code == 409
    assert "lost" in lost_draft.json()["detail"].lower()
