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
