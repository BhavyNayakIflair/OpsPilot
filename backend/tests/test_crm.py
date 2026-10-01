import pytest
from httpx import AsyncClient


async def owner(async_client: AsyncClient, name: str):
    result = await async_client.post("/api/v1/auth/register", json={
        "email": f"{name}@example.com", "password": "Password123!", "full_name": name,
        "org_name": f"{name} Company",
    })
    assert result.status_code == 201
    payload = result.json()
    return {"Authorization": f"Bearer {payload['access_token']}", "X-Org-ID": payload["org_id"]}, payload


@pytest.mark.asyncio
async def test_crm_crud_pipeline_and_tenant_isolation(async_client: AsyncClient):
    headers, _ = await owner(async_client, "crm_owner")
    other_headers, _ = await owner(async_client, "crm_other")
    stages = await async_client.get("/api/v1/crm/stages", headers=headers)
    assert stages.status_code == 200 and len(stages.json()) == 5
    company = await async_client.post("/api/v1/crm/companies", headers=headers, json={"name": "Northwind"})
    assert company.status_code == 201
    lead = await async_client.post("/api/v1/crm/leads", headers=headers, json={
        "title": "Website rebuild", "company_id": company.json()["id"], "stage_id": stages.json()[0]["id"], "value_cents": 250000,
    })
    assert lead.status_code == 201
    moved = await async_client.patch(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers, json={"stage_id": stages.json()[1]["id"]})
    assert moved.status_code == 200 and moved.json()["stage_id"] == stages.json()[1]["id"]
    won_stage = next(stage for stage in stages.json() if stage["is_won"])
    won = await async_client.patch(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers, json={"stage_id": won_stage["id"]})
    assert won.status_code == 200 and won.json()["status"] == "won"
    projects = await async_client.get("/api/v1/operations/projects", headers=headers)
    assert any(project["lead_id"] == lead.json()["id"] for project in projects.json())
    hidden = await async_client.get("/api/v1/crm/companies", headers=other_headers)
    assert hidden.status_code == 200 and hidden.json() == []
    forbidden = await async_client.patch(f"/api/v1/crm/leads/{lead.json()['id']}", headers=other_headers, json={"title": "stolen"})
    assert forbidden.status_code == 404


@pytest.mark.asyncio
async def test_public_lead_capture_creates_company_and_contact(async_client: AsyncClient):
    headers, payload = await owner(async_client, "capture_owner")
    org = await async_client.get("/api/v1/organizations/current", headers=headers)
    response = await async_client.post("/api/v1/public/leads", json={
        "org_slug": org.json()["slug"], "title": "Cloud migration", "name": "Sam Customer",
        "email": "sam@customer.example", "company": "Customer Co", "message": "Please call",
    })
    assert response.status_code == 201
    assert response.json()["org_id"] == payload["org_id"]
    assert response.json()["source"] == "website"
    missing = await async_client.post("/api/v1/public/leads", json={"org_slug": "no-such-org", "title": "x", "name": "x", "email": "x@x.example"})
    assert missing.status_code == 404
