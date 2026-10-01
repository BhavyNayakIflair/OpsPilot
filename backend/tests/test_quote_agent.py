import pytest
from httpx import AsyncClient

from app.gateway.base import LLMProvider
from app.gateway.factory import get_llm_provider
from app.main import app


class AgentFakeProvider(LLMProvider):
    def __init__(self, flagged=False):
        self.flagged = flagged

    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        if response_model.__name__ == "RequestUnderstanding":
            values = {"summary": "Build a customer portal", "requirements": ["customer portal"], "uncertainties": []}
        elif response_model.__name__ == "QuoteSelfReview":
            values = {"totals_match": True, "flags": ["Unusually high total; needs review."] if self.flagged else []}
        else:
            values = {
                "title": "Customer portal implementation", "currency": "USD",
                "line_items": [{"description": "Implementation", "quantity": 2, "unit_price_cents": 15000}],
                "total_cents": 30000, "terms": None, "assumptions": ["Scope follows the lead notes."],
            }
        return response_model.model_validate(values)

    def embed(self, texts, **kwargs):
        return [[1.0] + [0.0] * 767 for _ in texts]


async def _setup(client: AsyncClient, suffix: str):
    registered = await client.post("/api/v1/auth/register", json={
        "email": f"quote_agent_{suffix}@example.com", "password": "Password123!",
        "full_name": "Quote Agent Owner", "org_name": f"Quote Agent Org {suffix}",
    })
    assert registered.status_code == 201, registered.text
    payload = registered.json()
    headers = {"Authorization": f"Bearer {payload['access_token']}", "X-Org-ID": payload["org_id"]}
    card = await client.post("/api/v1/quotes/rate-cards", headers=headers, json={
        "name": "Standard", "currency": "USD", "default_rate_cents": 15000,
    })
    lead = await client.post("/api/v1/crm/leads", headers=headers, json={
        "title": "Customer portal", "currency": "USD", "notes": "Build customer portal.",
    })
    assert card.status_code == lead.status_code == 201, (card.text, lead.text)
    return headers, card.json(), lead.json()


@pytest.mark.asyncio
async def test_quote_agent_clean_branch_saves_draft(async_client: AsyncClient):
    headers, card, lead = await _setup(async_client, "clean")
    app.dependency_overrides[get_llm_provider] = lambda: AgentFakeProvider()

    response = await async_client.post("/api/v1/workflows/quote-agent/run", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": card["id"],
    })

    assert response.status_code == 201, response.text
    run = response.json()
    assert run["status"] == "completed"
    assert run["result_data"]["quote_status"] == "draft"
    assert {step["node_name"] for step in run["steps"]} >= {
        "understand_request", "retrieve_context", "draft_quote", "self_review", "save_quote",
    }
    quote_list = await async_client.get("/api/v1/quotes", headers=headers)
    assert len(quote_list.json()) == 1


@pytest.mark.asyncio
async def test_quote_agent_flagged_branch_resumes_after_approval(async_client: AsyncClient):
    headers, card, lead = await _setup(async_client, "flagged")
    app.dependency_overrides[get_llm_provider] = lambda: AgentFakeProvider(flagged=True)

    response = await async_client.post("/api/v1/workflows/quote-agent/run", headers=headers, json={
        "lead_id": lead["id"], "rate_card_id": card["id"],
    })

    assert response.status_code == 201, response.text
    paused = response.json()
    assert paused["status"] == "paused_for_approval"
    assert paused["approval"]["status"] == "pending"
    assert (await async_client.get("/api/v1/quotes", headers=headers)).json() == []

    approvals = await async_client.get("/api/v1/workflows/approvals", headers=headers)
    approval = next(item for item in approvals.json() if item["entity_type"] == "quote_agent")
    resumed = await async_client.post(
        f"/api/v1/workflows/approvals/quote_agent/{approval['id']}", headers=headers,
        json={"decision": "approved"},
    )

    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["status"] == "completed"
    assert resumed.json()["approval"]["status"] == "approved"
    assert len((await async_client.get("/api/v1/quotes", headers=headers)).json()) == 1

