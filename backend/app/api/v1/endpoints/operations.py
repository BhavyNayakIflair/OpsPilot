from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user, get_current_membership, require_role
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.crm import Lead
from app.models.operations import Employee, Project, ProjectTask, TimeEntry, LeaveRequest
from app.schemas.operations import (EmployeeCreate, EmployeeRead, EmployeeUpdate, ProjectCreate, ProjectRead, ProjectUpdate,
    TaskCreate, TaskRead, TimeEntryCreate, TimeEntryRead, TimeEntryUpdate, LeaveCreate, LeaveRead, LeaveUpdate)

router = APIRouter()


async def _owned(db, model, object_id, org_id):
    value = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if value is None: raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return value


@router.get("/people", response_model=list[EmployeeRead])
async def list_people(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.PROJECT_MANAGER]))):
    return (await db.scalars(select(Employee).where(Employee.org_id == org.id).order_by(Employee.full_name))).all()


@router.post("/people", response_model=EmployeeRead, status_code=201)
async def create_person(data: EmployeeCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    if data.user_id and not await db.scalar(select(User).join(User.memberships).where(User.id == data.user_id, Membership.org_id == org.id)):
        raise HTTPException(status_code=404, detail="User is not a member of this organization")
    row = Employee(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/people/{employee_id}", response_model=EmployeeRead)
async def update_person(employee_id: str, data: EmployeeUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    row = await _owned(db, Employee, employee_id, org.id)
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/people/{employee_id}", status_code=204)
async def deactivate_person(employee_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    row = await _owned(db, Employee, employee_id, org.id)
    # Preserve time and leave history; DELETE is a reversible soft-deactivation.
    row.is_active = False
    await db.commit()


@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Project).where(Project.org_id == org.id).order_by(Project.created_at.desc()))).all()


@router.post("/projects", response_model=ProjectRead, status_code=201)
async def create_project(data: ProjectCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    if data.lead_id:
        lead = await db.scalar(select(Lead).where(Lead.id == data.lead_id, Lead.org_id == org.id))
        if not lead: raise HTTPException(status_code=404, detail="Lead not found")
    row = Project(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/projects/{project_id}", response_model=ProjectRead)
async def update_project(project_id: str, data: ProjectUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Project, project_id, org.id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("lead_id"):
        await _owned(db, Lead, changes["lead_id"], org.id)
    for key, value in changes.items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Project, project_id, org.id)
    if await db.scalar(select(TimeEntry.id).where(TimeEntry.org_id == org.id, TimeEntry.project_id == row.id).limit(1)):
        raise HTTPException(status_code=409, detail="Projects with time history cannot be deleted; archive the project instead")
    row.status = "archived"
    await db.commit()


@router.get("/projects/{project_id}/tasks", response_model=list[TaskRead])
async def list_tasks(project_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _owned(db, Project, project_id, org.id)
    return (await db.scalars(select(ProjectTask).where(ProjectTask.org_id == org.id, ProjectTask.project_id == project_id).order_by(ProjectTask.created_at))).all()


@router.post("/projects/{project_id}/tasks", response_model=TaskRead, status_code=201)
async def create_task(project_id: str, data: TaskCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _owned(db, Project, project_id, org.id)
    if data.assignee_id: await _owned(db, Employee, data.assignee_id, org.id)
    row = ProjectTask(org_id=org.id, project_id=project_id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(task_id: str, data: dict, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, ProjectTask, task_id, org.id)
    allowed = {"title", "description", "status", "estimate_minutes", "assignee_id"}
    if set(data) - allowed: raise HTTPException(status_code=422, detail="Unsupported task fields")
    if data.get("assignee_id"): await _owned(db, Employee, data["assignee_id"], org.id)
    for key, value in data.items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, ProjectTask, task_id, org.id)
    if await db.scalar(select(TimeEntry.id).where(TimeEntry.org_id == org.id, TimeEntry.task_id == row.id).limit(1)):
        raise HTTPException(status_code=409, detail="Tasks with time history cannot be deleted")
    await db.delete(row); await db.commit()


@router.get("/timesheets", response_model=list[TimeEntryRead])
async def list_timesheets(org: Organization = Depends(get_current_tenant), user: User = Depends(get_current_user), membership: Membership = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    query = select(TimeEntry).where(TimeEntry.org_id == org.id)
    if membership.role not in (RoleType.OWNER.value, RoleType.APPROVER.value, RoleType.PROJECT_MANAGER.value, RoleType.FINANCE.value):
        query = query.where(TimeEntry.user_id == user.id)
    return (await db.scalars(query.order_by(TimeEntry.entry_date.desc(), TimeEntry.created_at.desc()))).all()


@router.post("/timesheets", response_model=TimeEntryRead, status_code=201)
async def create_time_entry(data: TimeEntryCreate, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _owned(db, Project, data.project_id, org.id)
    if data.task_id:
        task = await _owned(db, ProjectTask, data.task_id, org.id)
        if task.project_id != data.project_id: raise HTTPException(status_code=422, detail="Task must belong to the selected project")
    employee_id = data.employee_id
    if employee_id:
        employee = await _owned(db, Employee, employee_id, org.id)
        if employee.user_id and employee.user_id != user.id: raise HTTPException(status_code=403, detail="You can only submit time for yourself")
    else:
        employee = await db.scalar(select(Employee).where(Employee.org_id == org.id, Employee.user_id == user.id))
        employee_id = employee.id if employee else None
    row = TimeEntry(org_id=org.id, user_id=user.id, employee_id=employee_id, **data.model_dump(exclude={"employee_id"}))
    db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/timesheets/{entry_id}", response_model=TimeEntryRead)
async def update_time_entry(entry_id: str, data: TimeEntryUpdate, user: User = Depends(get_current_user), membership: Membership = Depends(get_current_membership), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, TimeEntry, entry_id, org.id)
    can_manage = membership.role in (RoleType.OWNER.value, RoleType.APPROVER.value, RoleType.PROJECT_MANAGER.value, RoleType.FINANCE.value)
    if row.approval_status != "pending" or (row.user_id != user.id and not can_manage):
        raise HTTPException(status_code=403, detail="Only your pending entries can be edited")
    changes = data.model_dump(exclude_unset=True)
    project_id = changes.get("project_id", row.project_id)
    await _owned(db, Project, project_id, org.id)
    task_id = changes.get("task_id", row.task_id)
    if task_id:
        task = await _owned(db, ProjectTask, task_id, org.id)
        if task.project_id != project_id: raise HTTPException(status_code=422, detail="Task must belong to the selected project")
    if "entry_date" in changes and changes["entry_date"] is None: raise HTTPException(status_code=422, detail="Entry date is required")
    for key, value in changes.items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/timesheets/{entry_id}", status_code=204)
async def delete_time_entry(entry_id: str, user: User = Depends(get_current_user), membership: Membership = Depends(get_current_membership), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, TimeEntry, entry_id, org.id)
    can_manage = membership.role in (RoleType.OWNER.value, RoleType.APPROVER.value, RoleType.PROJECT_MANAGER.value, RoleType.FINANCE.value)
    if row.approval_status != "pending" or (row.user_id != user.id and not can_manage):
        raise HTTPException(status_code=403, detail="Only your pending entries can be deleted")
    await db.delete(row); await db.commit()


@router.patch("/timesheets/{entry_id}/approval", response_model=TimeEntryRead)
async def approve_time_entry(entry_id: str, data: dict, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE]))):
    status_value = data.get("status")
    if status_value not in ("approved", "rejected"): raise HTTPException(status_code=422, detail="Status must be approved or rejected")
    row = await _owned(db, TimeEntry, entry_id, org.id); row.approval_status = status_value
    await db.commit(); await db.refresh(row); return row


@router.get("/leave-requests", response_model=list[LeaveRead])
async def list_leave_requests(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(LeaveRequest).where(LeaveRequest.org_id == org.id).order_by(LeaveRequest.created_at.desc()))).all()


@router.post("/leave-requests", response_model=LeaveRead, status_code=201)
async def create_leave_request(data: LeaveCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    if data.end_date < data.start_date: raise HTTPException(status_code=422, detail="End date must be on or after start date")
    await _owned(db, Employee, data.employee_id, org.id)
    row = LeaveRequest(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/leave-requests/{request_id}", response_model=LeaveRead)
async def update_leave_request(request_id: str, data: LeaveUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, LeaveRequest, request_id, org.id)
    if row.status != "pending": raise HTTPException(status_code=409, detail="Reviewed leave requests cannot be edited")
    changes = data.model_dump(exclude_unset=True)
    start_date = changes.get("start_date", row.start_date)
    end_date = changes.get("end_date", row.end_date)
    if end_date < start_date: raise HTTPException(status_code=422, detail="End date must be on or after start date")
    for key, value in changes.items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/leave-requests/{request_id}", status_code=204)
async def delete_leave_request(request_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, LeaveRequest, request_id, org.id)
    if row.status != "pending": raise HTTPException(status_code=409, detail="Reviewed leave requests cannot be deleted")
    await db.delete(row); await db.commit()
