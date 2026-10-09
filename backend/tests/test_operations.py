import pytest
from httpx import AsyncClient


async def create_org_and_owner(client: AsyncClient, prefix: str):
    email = f"{prefix}_owner@test.com"
    res = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": f"{prefix} Owner",
        "org_name": f"{prefix} Org",
    })
    assert res.status_code == 201
    data = res.json()
    headers = {
        "Authorization": f"Bearer {data['access_token']}",
        "X-Org-ID": data["org_id"],
    }
    return {
        "headers": headers,
        "user_id": data["user_id"],
        "org_id": data["org_id"],
        "token": data["access_token"],
    }


async def create_user_with_role(client: AsyncClient, owner_headers: dict, org_id: str, prefix: str, role: str):
    email = f"{prefix}_{role}@test.com"
    reg = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": f"{prefix} {role.title()}",
    })
    assert reg.status_code == 201
    user_data = reg.json()
    
    # Owner invites user with role
    invite = await client.post(
        "/api/v1/organizations/members",
        headers=owner_headers,
        json={"email": email, "role": role},
    )
    assert invite.status_code == 201
    headers = {
        "Authorization": f"Bearer {user_data['access_token']}",
        "X-Org-ID": org_id,
    }
    return {
        "headers": headers,
        "user_id": user_data["user_id"],
        "token": user_data["access_token"],
    }


@pytest.mark.asyncio
async def test_people_crud_and_role_gates(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "people_test")
    headers = owner["headers"]
    
    # 1. Create employee by owner (passes finance check)
    emp_res = await async_client.post(
        "/api/v1/operations/people",
        headers=headers,
        json={
            "full_name": "Alice Developer",
            "title": "Backend Engineer",
            "email": "alice@test.com",
            "billing_rate_cents": 12000,
            "cost_rate_cents": 6000,
        },
    )
    assert emp_res.status_code == 201
    emp_id = emp_res.json()["id"]
    assert emp_res.json()["full_name"] == "Alice Developer"
    assert emp_res.json()["is_active"] is True

    # 2. List people (owner passes)
    list_res = await async_client.get("/api/v1/operations/people", headers=headers)
    assert list_res.status_code == 200
    assert any(p["id"] == emp_id for p in list_res.json())

    # 3. Update person
    patch_res = await async_client.patch(
        f"/api/v1/operations/people/{emp_id}",
        headers=headers,
        json={"title": "Senior Backend Engineer", "billing_rate_cents": 14000},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Senior Backend Engineer"
    assert patch_res.json()["billing_rate_cents"] == 14000

    # 4. Soft deactivate person (DELETE sets is_active=False)
    del_res = await async_client.delete(f"/api/v1/operations/people/{emp_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify is_active is False
    list_after = await async_client.get("/api/v1/operations/people", headers=headers)
    assert list_after.status_code == 200
    found = next(p for p in list_after.json() if p["id"] == emp_id)
    assert found["is_active"] is False

    # 5. Role gates on /people
    # Create employee-role user
    emp_user = await create_user_with_role(async_client, headers, owner["org_id"], "people_test", "employee")
    # Employee cannot list /people (403)
    emp_list = await async_client.get("/api/v1/operations/people", headers=emp_user["headers"])
    assert emp_list.status_code == 403

    # Employee cannot create /people (403)
    emp_create = await async_client.post(
        "/api/v1/operations/people",
        headers=emp_user["headers"],
        json={"full_name": "Bob", "billing_rate_cents": 1000},
    )
    assert emp_create.status_code == 403

    # Project manager can list /people (200) but cannot create /people (403)
    pm_user = await create_user_with_role(async_client, headers, owner["org_id"], "people_test", "project_manager")
    pm_list = await async_client.get("/api/v1/operations/people", headers=pm_user["headers"])
    assert pm_list.status_code == 200

    pm_create = await async_client.post(
        "/api/v1/operations/people",
        headers=pm_user["headers"],
        json={"full_name": "Bob", "billing_rate_cents": 1000},
    )
    assert pm_create.status_code == 403


@pytest.mark.asyncio
async def test_tenant_isolation_on_operations(async_client: AsyncClient):
    org_a = await create_org_and_owner(async_client, "iso_a")
    org_b = await create_org_and_owner(async_client, "iso_b")

    # Org A creates an employee and a project
    emp_a = await async_client.post(
        "/api/v1/operations/people",
        headers=org_a["headers"],
        json={"full_name": "Employee A"},
    )
    assert emp_a.status_code == 201
    emp_a_id = emp_a.json()["id"]

    proj_a = await async_client.post(
        "/api/v1/operations/projects",
        headers=org_a["headers"],
        json={"name": "Project A", "budget_minutes": 600},
    )
    assert proj_a.status_code == 201
    proj_a_id = proj_a.json()["id"]

    task_a = await async_client.post(
        f"/api/v1/operations/projects/{proj_a_id}/tasks",
        headers=org_a["headers"],
        json={"title": "Task A"},
    )
    assert task_a.status_code == 201
    task_a_id = task_a.json()["id"]

    # Org B attempts to access Org A's resources -> 404
    assert (await async_client.patch(f"/api/v1/operations/people/{emp_a_id}", headers=org_b["headers"], json={"full_name": "Hacked"})).status_code == 404
    assert (await async_client.patch(f"/api/v1/operations/projects/{proj_a_id}", headers=org_b["headers"], json={"name": "Hacked"})).status_code == 404
    assert (await async_client.get(f"/api/v1/operations/projects/{proj_a_id}/tasks", headers=org_b["headers"])).status_code == 404
    assert (await async_client.patch(f"/api/v1/operations/tasks/{task_a_id}", headers=org_b["headers"], json={"title": "Hacked"})).status_code == 404


@pytest.mark.asyncio
async def test_project_and_task_crud_and_status(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "proj_task")
    headers = owner["headers"]

    # 1. Create project
    proj_res = await async_client.post(
        "/api/v1/operations/projects",
        headers=headers,
        json={
            "name": "OpsPilot Core",
            "description": "Delivery system",
            "budget_minutes": 1200,
            "budget_amount_cents": 250000,
            "currency": "USD",
        },
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 2. Update project
    patch_p = await async_client.patch(
        f"/api/v1/operations/projects/{proj_id}",
        headers=headers,
        json={"description": "Updated delivery system"},
    )
    assert patch_p.status_code == 200
    assert patch_p.json()["description"] == "Updated delivery system"

    # 3. Create task
    task_res = await async_client.post(
        f"/api/v1/operations/projects/{proj_id}/tasks",
        headers=headers,
        json={"title": "Initial Setup", "status": "todo", "estimate_minutes": 120},
    )
    assert task_res.status_code == 201
    task_id = task_res.json()["id"]
    assert task_res.json()["status"] == "todo"

    # 4. List tasks under project
    tasks_list = await async_client.get(f"/api/v1/operations/projects/{proj_id}/tasks", headers=headers)
    assert tasks_list.status_code == 200
    assert len(tasks_list.json()) == 1

    # 5. Patch task with allowed fields
    patch_t = await async_client.patch(
        f"/api/v1/operations/tasks/{task_id}",
        headers=headers,
        json={"status": "in_progress", "estimate_minutes": 180},
    )
    assert patch_t.status_code == 200
    assert patch_t.json()["status"] == "in_progress"
    assert patch_t.json()["estimate_minutes"] == 180

    # 6. Patch task with unsupported field -> 422
    unsupported = await async_client.patch(
        f"/api/v1/operations/tasks/{task_id}",
        headers=headers,
        json={"invalid_field": "test"},
    )
    assert unsupported.status_code == 422

    # 7. Delete task with no time history
    del_t = await async_client.delete(f"/api/v1/operations/tasks/{task_id}", headers=headers)
    assert del_t.status_code == 204

    # 8. Delete project with no time history (archives it)
    del_p = await async_client.delete(f"/api/v1/operations/projects/{proj_id}", headers=headers)
    assert del_p.status_code == 204
    projects = await async_client.get("/api/v1/operations/projects", headers=headers)
    archived = next(p for p in projects.json() if p["id"] == proj_id)
    assert archived["status"] == "archived"


@pytest.mark.asyncio
async def test_timesheets_and_two_approval_paths(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "ts_test")
    headers = owner["headers"]

    # Create project and task
    proj = (await async_client.post("/api/v1/operations/projects", headers=headers, json={"name": "TS Proj"})).json()
    task = (await async_client.post(f"/api/v1/operations/projects/{proj['id']}/tasks", headers=headers, json={"title": "TS Task"})).json()

    # Create time entry
    te_res = await async_client.post(
        "/api/v1/operations/timesheets",
        headers=headers,
        json={
            "project_id": proj["id"],
            "task_id": task["id"],
            "entry_date": "2026-10-01",
            "minutes": 180,
            "description": "Implemented core feature",
            "is_billable": True,
        },
    )
    assert te_res.status_code == 201
    entry_1_id = te_res.json()["id"]
    assert te_res.json()["approval_status"] == "pending"

    # Edit pending time entry
    edit_res = await async_client.patch(
        f"/api/v1/operations/timesheets/{entry_1_id}",
        headers=headers,
        json={"minutes": 240, "description": "Updated feature work"},
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["minutes"] == 240

    # Path 1: Approval via /operations/timesheets/{id}/approval
    appr_1 = await async_client.patch(
        f"/api/v1/operations/timesheets/{entry_1_id}/approval",
        headers=headers,
        json={"status": "approved"},
    )
    assert appr_1.status_code == 200
    assert appr_1.json()["approval_status"] == "approved"

    # Create another time entry for Path 2
    te_2 = await async_client.post(
        "/api/v1/operations/timesheets",
        headers=headers,
        json={
            "project_id": proj["id"],
            "task_id": task["id"],
            "entry_date": "2026-10-02",
            "minutes": 120,
            "description": "Testing and QA",
            "is_billable": True,
        },
    )
    assert te_2.status_code == 201
    entry_2_id = te_2.json()["id"]

    # Path 2: Approval via /workflows/approvals/timesheet/{id}
    appr_2 = await async_client.post(
        f"/api/v1/workflows/approvals/timesheet/{entry_2_id}",
        headers=headers,
        json={"decision": "approved"},
    )
    assert appr_2.status_code == 200
    assert appr_2.json()["status"] == "approved"

    # Verify time entry 2 status is approved
    ts_list = await async_client.get("/api/v1/operations/timesheets", headers=headers)
    e2 = next(e for e in ts_list.json() if e["id"] == entry_2_id)
    assert e2["approval_status"] == "approved"


@pytest.mark.asyncio
async def test_delete_with_time_history_returns_409(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "del_hist")
    headers = owner["headers"]

    proj = (await async_client.post("/api/v1/operations/projects", headers=headers, json={"name": "Hist Proj"})).json()
    task = (await async_client.post(f"/api/v1/operations/projects/{proj['id']}/tasks", headers=headers, json={"title": "Hist Task"})).json()
    await async_client.post(
        "/api/v1/operations/timesheets",
        headers=headers,
        json={
            "project_id": proj["id"],
            "task_id": task["id"],
            "entry_date": "2026-10-01",
            "minutes": 60,
            "description": "Logged hour",
        },
    )

    # 1. Attempt to delete task with time history -> 409
    del_task = await async_client.delete(f"/api/v1/operations/tasks/{task['id']}", headers=headers)
    assert del_task.status_code == 409
    assert "time history" in del_task.json()["detail"].lower()

    # 2. Attempt to delete project with time history -> 409
    del_proj = await async_client.delete(f"/api/v1/operations/projects/{proj['id']}", headers=headers)
    assert del_proj.status_code == 409
    assert "archive the project instead" in del_proj.json()["detail"].lower()


@pytest.mark.asyncio
async def test_leave_requests_crud_and_validation(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "leave_test")
    headers = owner["headers"]

    emp = (await async_client.post(
        "/api/v1/operations/people",
        headers=headers,
        json={"full_name": "Leave Employee"},
    )).json()

    # 1. Invalid dates: end < start -> 422
    inv = await async_client.post(
        "/api/v1/operations/leave-requests",
        headers=headers,
        json={
            "employee_id": emp["id"],
            "start_date": "2026-10-15",
            "end_date": "2026-10-10",
            "reason": "Invalid range",
        },
    )
    assert inv.status_code == 422

    # 2. Create valid leave request
    leave = await async_client.post(
        "/api/v1/operations/leave-requests",
        headers=headers,
        json={
            "employee_id": emp["id"],
            "start_date": "2026-10-10",
            "end_date": "2026-10-15",
            "reason": "Annual vacation",
        },
    )
    assert leave.status_code == 201
    leave_id = leave.json()["id"]
    assert leave.json()["status"] == "pending"

    # 3. List leave requests
    leaves = await async_client.get("/api/v1/operations/leave-requests", headers=headers)
    assert leaves.status_code == 200
    assert any(l["id"] == leave_id for l in leaves.json())

    # 4. Update pending leave request
    patched = await async_client.patch(
        f"/api/v1/operations/leave-requests/{leave_id}",
        headers=headers,
        json={"reason": "Updated reason"},
    )
    assert patched.status_code == 200
    assert patched.json()["reason"] == "Updated reason"

    # 5. Delete pending leave request
    deleted = await async_client.delete(f"/api/v1/operations/leave-requests/{leave_id}", headers=headers)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_won_lead_creates_project(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "crm_won_test")
    headers = owner["headers"]

    stages = (await async_client.get("/api/v1/crm/stages", headers=headers)).json()
    open_stage = stages[0]["id"]
    won_stage = next(s["id"] for s in stages if s["is_won"])

    company = (await async_client.post("/api/v1/crm/companies", headers=headers, json={"name": "Won Lead Co"})).json()
    lead = (await async_client.post(
        "/api/v1/crm/leads",
        headers=headers,
        json={
            "title": "Big Contract",
            "company_id": company["id"],
            "stage_id": open_stage,
            "value_cents": 500000,
            "currency": "USD",
        },
    )).json()

    # Move to won
    move_won = await async_client.patch(
        f"/api/v1/crm/leads/{lead['id']}",
        headers=headers,
        json={"stage_id": won_stage},
    )
    assert move_won.status_code == 200
    assert move_won.json()["status"] == "won"

    # Verify project auto-created
    projects = (await async_client.get("/api/v1/operations/projects", headers=headers)).json()
    matching = next((p for p in projects if p["lead_id"] == lead["id"]), None)
    assert matching is not None
    assert matching["name"] == "Big Contract"
    assert matching["budget_amount_cents"] == 500000
    assert matching["currency"] == "USD"
