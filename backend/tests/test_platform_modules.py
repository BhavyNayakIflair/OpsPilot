import pytest
from httpx import AsyncClient


async def register(async_client: AsyncClient, email: str):
    result = await async_client.post("/api/v1/auth/register", json={
        "email": email, "password": "Password123!", "full_name": "Platform Owner", "org_name": "Platform Org",
    })
    data = result.json()
    return {"Authorization": f"Bearer {data['access_token']}", "X-Org-ID": data["org_id"]}


@pytest.mark.asyncio
async def test_csv_dry_run_apply_documents_workflows_and_approvals(async_client: AsyncClient):
    headers = await register(async_client, "platform_owner@example.com")
    upload = await async_client.post("/api/v1/migration/dry-run", headers=headers, data={"target": "companies"}, files={
        "file": ("companies.csv", b"name,website\nImported Co,https://example.com\n", "text/csv"),
    })
    assert upload.status_code == 201 and upload.json()["row_count"] == 1
    imported = await async_client.post(f"/api/v1/migration/jobs/{upload.json()['id']}/apply", headers=headers)
    assert imported.status_code == 200 and imported.json()["imported"] == 1
    companies = await async_client.get("/api/v1/crm/companies", headers=headers)
    assert companies.json()[0]["name"] == "Imported Co"
    document = await async_client.post("/api/v1/documents", headers=headers, json={
        "title": "Master services agreement", "category": "contract", "content": "Payment due within thirty days.",
    })
    assert document.status_code == 201
    search = await async_client.get("/api/v1/documents", headers=headers, params={"q": "thirty days"})
    assert len(search.json()) == 1
    workflow = await async_client.post("/api/v1/workflows/lead_qualification", headers=headers)
    assert workflow.status_code == 201 and workflow.json()["status"] == "completed"
    expense = await async_client.post("/api/v1/billing/expenses", headers=headers, json={
        "vendor": "Hosting", "description": "Monthly account", "amount_cents": 1200, "expense_date": "2026-09-29",
    })
    approvals = await async_client.get("/api/v1/workflows/approvals", headers=headers)
    assert any(item["id"] == expense.json()["id"] for item in approvals.json())
    decision = await async_client.post(f"/api/v1/workflows/approvals/expense/{expense.json()['id']}", headers=headers, json={"decision": "approved"})
    assert decision.status_code == 200 and decision.json()["status"] == "approved"
