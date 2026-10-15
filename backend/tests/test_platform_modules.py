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


@pytest.mark.asyncio
async def test_migration_preview_lists_duplicates_and_imports_edited_rows(async_client: AsyncClient):
    headers = await register(async_client, "migration_preview_owner@example.com")
    existing = await async_client.post(
        "/api/v1/crm/companies", headers=headers, json={"name": "Existing Co"},
    )
    assert existing.status_code == 201, existing.text

    upload = await async_client.post(
        "/api/v1/migration/dry-run",
        headers=headers,
        data={"target": "companies"},
        files={
            "file": (
                "companies.csv",
                b"name,website\nExisting Co,https://existing.example\nNew Co,https://new.example\nnew co,https://duplicate.example\n",
                "text/csv",
            ),
        },
    )
    assert upload.status_code == 201, upload.text
    preview = upload.json()
    assert preview["row_count"] == 3
    assert len(preview["rows_preview"]) == 3
    assert preview["duplicate_count"] == 2
    assert preview["importable_count"] == 1
    assert preview["rows_preview"][0]["duplicate_reason"] == "Already exists in this workspace"
    assert preview["rows_preview"][2]["duplicate_reason"] == "Duplicate of CSV row 3"

    edited_rows = [row["data"] for row in preview["rows_preview"]]
    edited_rows[1]["name"] = "Renamed Co"
    checked = await async_client.put(
        f"/api/v1/migration/jobs/{preview['id']}/preview",
        headers=headers,
        json={"rows": edited_rows},
    )
    assert checked.status_code == 200, checked.text
    assert checked.json()["duplicate_count"] == 1
    assert checked.json()["importable_count"] == 2

    imported = await async_client.post(
        f"/api/v1/migration/jobs/{preview['id']}/apply", headers=headers,
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported"] == 2
    assert imported.json()["skipped_duplicates"] == 1
    companies = await async_client.get("/api/v1/crm/companies", headers=headers)
    assert {company["name"] for company in companies.json()} == {"Existing Co", "Renamed Co", "new co"}
