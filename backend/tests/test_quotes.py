import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_quote_totals_acceptance_and_pdf(async_client: AsyncClient):
    registered = await async_client.post("/api/v1/auth/register", json={
        "email": "quotes_owner@example.com", "password": "Password123!", "full_name": "Quotes Owner", "org_name": "Quote Org",
    })
    assert registered.status_code == 201
    payload = registered.json()
    headers = {"Authorization": f"Bearer {payload['access_token']}", "X-Org-ID": payload["org_id"]}
    card = await async_client.post("/api/v1/quotes/rate-cards", headers=headers, json={"name": "Standard", "currency": "USD"})
    assert card.status_code == 201
    quote = await async_client.post("/api/v1/quotes", headers=headers, json={
        "title": "Discovery proposal", "rate_card_id": card.json()["id"], "currency": "USD",
        "discount_bps": 1000, "tax_bps": 1000,
        "line_items": [{"description": "Discovery workshop", "quantity": 2, "unit_price_cents": 50000}],
    })
    assert quote.status_code == 201
    assert quote.json()["subtotal_cents"] == 100000
    assert quote.json()["total_cents"] == 99000
    pdf = await async_client.get(f"/api/v1/quotes/{quote.json()['id']}/pdf", headers=headers)
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")
    accepted = await async_client.get(f"/api/v1/quotes/accept/{quote.json()['accept_token']}")
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    repeated = await async_client.get(f"/api/v1/quotes/accept/{quote.json()['accept_token']}")
    assert repeated.status_code == 200 and repeated.json()["status"] == "accepted"
