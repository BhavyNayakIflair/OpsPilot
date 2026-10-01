import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_invoice_totals_payment_and_expense_approval(async_client: AsyncClient):
    registered = await async_client.post("/api/v1/auth/register", json={
        "email": "billing_owner@example.com", "password": "Password123!", "full_name": "Billing Owner", "org_name": "Billing Org",
    })
    assert registered.status_code == 201
    payload = registered.json()
    headers = {"Authorization": f"Bearer {payload['access_token']}", "X-Org-ID": payload["org_id"]}
    invoice = await async_client.post("/api/v1/billing/invoices", headers=headers, json={
        "client_name": "Acme", "currency": "USD", "issue_date": "2026-09-29", "due_date": "2026-10-29", "tax_bps": 1000,
        "line_items": [{"description": "Consulting", "quantity": 2, "unit_price_cents": 50000}],
    })
    assert invoice.status_code == 201
    assert invoice.json()["subtotal_cents"] == 100000
    assert invoice.json()["total_cents"] == 110000
    payment = await async_client.post(f"/api/v1/billing/invoices/{invoice.json()['id']}/payments", headers=headers, json={"amount_cents": 110000, "paid_date": "2026-09-29"})
    assert payment.status_code == 201
    refreshed = await async_client.get(f"/api/v1/billing/invoices/{invoice.json()['id']}", headers=headers)
    assert refreshed.json()["paid_cents"] == 110000 and refreshed.json()["status"] == "paid"
    expense = await async_client.post("/api/v1/billing/expenses", headers=headers, json={"vendor": "Cloud host", "description": "Monthly hosting", "amount_cents": 4000, "expense_date": "2026-09-29"})
    assert expense.status_code == 201 and expense.json()["status"] == "pending"
    reviewed = await async_client.patch(f"/api/v1/billing/expenses/{expense.json()['id']}/review", headers=headers, json={"status": "approved"})
    assert reviewed.status_code == 200 and reviewed.json()["status"] == "approved"
