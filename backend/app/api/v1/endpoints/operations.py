from datetime import datetime, timezone, date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user, get_current_membership, require_role
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.crm import Lead
from app.models.operations import (
    Employee, Project, ProjectTask, TimeEntry, LeaveRequest,
    Team, TeamMember, ProjectMember, TaskAssignee, LeaveType, LeaveBalance
)
from app.schemas.operations import (
    EmployeeCreate, EmployeeRead, EmployeeUpdate,
    ProjectCreate, ProjectRead, ProjectUpdate,
    TaskCreate, TaskRead, TaskUpdate, TaskAssigneeRead,
    TimeEntryCreate, TimeEntryRead, TimeEntryUpdate,
    LeaveCreate, LeaveRead, LeaveUpdate, LeaveTypeCreate, LeaveTypeRead,
    LeaveBalanceRead, LeaveCalendarEventRead, LeaveDecisionRequest,
    TeamCreate, TeamUpdate, TeamRead, TeamDetailRead, TeamMemberCreate, TeamMemberRead,
    ProjectMemberCreate, ProjectMemberUpdate, ProjectMemberRead, PersonDetailRead
)
from app.services.leave_service import LeaveService
from app.services.assignment_service import AssignmentService

router = APIRouter()

VALID_TASK_STATUSES = {"todo", "in_progress", "in_review", "done"}
VALID_TASK_PRIORITIES = {"low", "medium", "high", "urgent"}


async def _owned(db: AsyncSession, model, object_id: str, org_id: str):
    value = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if value is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return value


async def _task_out(db: AsyncSession, task: ProjectTask) -> dict:
    td = {column.name: getattr(task, column.name) for column in ProjectTask.__table__.columns}
    assignees = (await db.execute(
        select(TaskAssignee, Employee.full_name, Employee.email)
        .join(Employee, TaskAssignee.person_id == Employee.id)
        .where(TaskAssignee.task_id == task.id, TaskAssignee.org_id == task.org_id)
        .order_by(TaskAssignee.role.asc())
    )).all()
    td["assignees"] = [
        {**{col.name: getattr(a, col.name) for col in TaskAssignee.__table__.columns},
         "person_name": name, "person_email": email}
        for a, name, email in assignees
    ]
    return td


# -------------------------------------------------------------
# PEOPLE / EMPLOYEES
# -------------------------------------------------------------

@router.get("/me", response_model=EmployeeRead)
async def get_my_employee(org: Organization = Depends(get_current_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(Employee).where(Employee.org_id == org.id, Employee.user_id == user.id))
    if row is None:
        raise HTTPException(status_code=404, detail="No employee profile is linked to this account")
    return row


@router.get("/people", response_model=list[EmployeeRead])
async def list_people(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.PROJECT_MANAGER]))):
    return (await db.scalars(select(Employee).where(Employee.org_id == org.id).order_by(Employee.full_name))).all()


@router.get("/people/directory", response_model=list[EmployeeRead])
async def list_people_directory(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return (await db.scalars(select(Employee).where(Employee.org_id == org.id).order_by(Employee.full_name))).all()


@router.post("/people", response_model=EmployeeRead, status_code=201)
async def create_person(data: EmployeeCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    if data.user_id and not await db.scalar(select(User).join(User.memberships).where(User.id == data.user_id, Membership.org_id == org.id)):
        raise HTTPException(status_code=404, detail="User is not a member of this organization")
    row = Employee(org_id=org.id, **data.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/people/{employee_id}/detail", response_model=PersonDetailRead)
async def get_person_detail(
    employee_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.EMPLOYEE])),
):
    """Return person profile with assigned tasks, project allocations, leave balances, upcoming leave, and load."""
    emp = await _owned(db, Employee, employee_id, org.id)

    # 1. Teams
    teams_query = select(Team).join(TeamMember, TeamMember.team_id == Team.id).where(
        TeamMember.person_id == emp.id, TeamMember.org_id == org.id
    )
    teams = (await db.scalars(teams_query)).all()
    teams_out = []
    for t in teams:
        m_count = (await db.scalar(select(func.count(TeamMember.id)).where(TeamMember.team_id == t.id))) or 0
        teams_out.append({**{c.name: getattr(t, c.name) for c in Team.__table__.columns}, "member_count": m_count})

    # 2. Project Allocations
    p_members = (await db.scalars(
        select(ProjectMember).where(ProjectMember.person_id == emp.id, ProjectMember.org_id == org.id)
    )).all()
    allocations_out = [
        {**{c.name: getattr(pm, c.name) for c in ProjectMember.__table__.columns},
         "person_name": emp.full_name, "person_email": emp.email, "person_title": emp.title}
        for pm in p_members
    ]

    # 3. Assigned Tasks
    tasks_query = select(ProjectTask).join(
        TaskAssignee, TaskAssignee.task_id == ProjectTask.id
    ).where(
        TaskAssignee.person_id == emp.id, TaskAssignee.org_id == org.id, ProjectTask.status != "done"
    )
    tasks = (await db.scalars(tasks_query)).all()
    tasks_out = [await _task_out(db, t) for t in tasks]

    # 4. Leave Balances
    current_year = date.today().year
    balances = (await db.execute(
        select(LeaveBalance, LeaveType.name, LeaveType.code)
        .join(LeaveType, LeaveBalance.leave_type_id == LeaveType.id)
        .where(LeaveBalance.person_id == emp.id, LeaveBalance.org_id == org.id, LeaveBalance.year == current_year)
    )).all()
    balances_out = [
        {**{c.name: getattr(b, c.name) for c in LeaveBalance.__table__.columns},
         "leave_type_name": lt_name, "leave_type_code": lt_code,
         "remaining_days": max(0.0, b.allocated_days - b.used_days)}
        for b, lt_name, lt_code in balances
    ]

    # 5. Upcoming Leave
    today = date.today()
    upcoming_leaves = (await db.scalars(
        select(LeaveRequest).where(
            LeaveRequest.employee_id == emp.id,
            LeaveRequest.org_id == org.id,
            LeaveRequest.end_date >= today,
            LeaveRequest.status.in_(["pending", "approved"]),
        ).order_by(LeaveRequest.start_date.asc())
    )).all()

    # 6. Current Load
    load_info = await AssignmentService.calculate_person_load(db, org.id, emp.id)

    emp_data = {c.name: getattr(emp, c.name) for c in Employee.__table__.columns}
    emp_data.update({
        "weekly_capacity_hours": emp.weekly_capacity_hours,
        "teams": teams_out,
        "project_allocations": allocations_out,
        "assigned_tasks": tasks_out,
        "leave_balances": balances_out,
        "upcoming_leave": upcoming_leaves,
        "current_load_percent": load_info["load_percent"],
    })
    return emp_data


@router.patch("/people/{employee_id}", response_model=EmployeeRead)
async def update_person(employee_id: str, data: EmployeeUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    row = await _owned(db, Employee, employee_id, org.id)
    changes = data.model_dump(exclude_unset=True)
    if "user_id" in changes and changes["user_id"]:
        user_id = changes["user_id"]
        if not await db.scalar(select(User).join(User.memberships).where(User.id == user_id, Membership.org_id == org.id)):
            raise HTTPException(status_code=404, detail="User is not a member of this organization")
    for key, value in changes.items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/people/{employee_id}", status_code=204)
async def deactivate_person(employee_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    row = await _owned(db, Employee, employee_id, org.id)
    row.is_active = False
    await db.commit()


# -------------------------------------------------------------
# TEAMS & TEAM MEMBERS
# -------------------------------------------------------------

@router.get("/teams", response_model=List[TeamRead])
async def list_teams(
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.EMPLOYEE, RoleType.APPROVER, RoleType.FINANCE, RoleType.SALES])),
):
    teams = (await db.scalars(select(Team).where(Team.org_id == org.id, Team.is_active == True).order_by(Team.name))).all()
    out = []
    for t in teams:
        td = {column.name: getattr(t, column.name) for column in Team.__table__.columns}
        td["member_count"] = (await db.scalar(select(func.count(TeamMember.id)).where(TeamMember.team_id == t.id))) or 0
        if t.lead_id:
            lead = await db.scalar(select(Employee.full_name).where(Employee.id == t.lead_id))
            td["lead_name"] = lead
        out.append(td)
    return out


@router.post("/teams", response_model=TeamRead, status_code=201)
async def create_team(
    data: TeamCreate,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    if data.lead_id:
        await _owned(db, Employee, data.lead_id, org.id)
    team = Team(org_id=org.id, **data.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    td = {column.name: getattr(team, column.name) for column in Team.__table__.columns}
    td["member_count"] = 0
    return td


@router.get("/teams/{team_id}", response_model=TeamDetailRead)
async def get_team_detail(
    team_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.EMPLOYEE, RoleType.APPROVER, RoleType.FINANCE, RoleType.SALES])),
):
    team = await _owned(db, Team, team_id, org.id)
    td = {column.name: getattr(team, column.name) for column in Team.__table__.columns}
    today = date.today()
    week_end = today + timedelta(days=7)

    members_query = (
        select(TeamMember, Employee.full_name, Employee.email, Employee.title)
        .join(Employee, TeamMember.person_id == Employee.id)
        .where(TeamMember.team_id == team.id, TeamMember.org_id == org.id)
    )
    members_res = (await db.execute(members_query)).all()
    m_list = []
    for tm, name, email, title in members_res:
        tmd = {column.name: getattr(tm, column.name) for column in TeamMember.__table__.columns}
        tmd["person_name"] = name
        tmd["person_email"] = email
        tmd["person_title"] = title

        # Check leave availability
        leave_today = await db.scalar(
            select(LeaveRequest.id).where(
                LeaveRequest.employee_id == tm.person_id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= today,
                LeaveRequest.end_date >= today,
            )
        )
        leave_week = await db.scalar(
            select(LeaveRequest.id).where(
                LeaveRequest.employee_id == tm.person_id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= week_end,
                LeaveRequest.end_date >= today,
            )
        )
        tmd["is_on_leave_today"] = leave_today is not None
        tmd["is_on_leave_this_week"] = leave_week is not None
        m_list.append(tmd)

    td["members"] = m_list
    td["member_count"] = len(m_list)
    td["active_projects_count"] = 0
    return td


@router.patch("/teams/{team_id}", response_model=TeamRead)
async def update_team(
    team_id: str,
    data: TeamUpdate,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    team = await _owned(db, Team, team_id, org.id)
    changes = data.model_dump(exclude_unset=True)
    if "lead_id" in changes and changes["lead_id"]:
        await _owned(db, Employee, changes["lead_id"], org.id)
    for k, v in changes.items():
        setattr(team, k, v)
    await db.commit()
    await db.refresh(team)
    td = {column.name: getattr(team, column.name) for column in Team.__table__.columns}
    td["member_count"] = (await db.scalar(select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id))) or 0
    return td


@router.delete("/teams/{team_id}", status_code=204)
async def delete_team(
    team_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    team = await _owned(db, Team, team_id, org.id)
    team.is_active = False
    await db.commit()


@router.post("/teams/{team_id}/members", status_code=201, response_model=TeamMemberRead)
async def add_team_member(
    team_id: str,
    data: TeamMemberCreate,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    await _owned(db, Team, team_id, org.id)
    emp = await _owned(db, Employee, data.person_id, org.id)
    existing = await db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.person_id == data.person_id)
    )
    if existing:
        existing.role = data.role
        tm = existing
    else:
        tm = TeamMember(org_id=org.id, team_id=team_id, person_id=data.person_id, role=data.role)
        db.add(tm)
    await db.commit()
    await db.refresh(tm)
    tmd = {column.name: getattr(tm, column.name) for column in TeamMember.__table__.columns}
    tmd["person_name"] = emp.full_name
    tmd["person_email"] = emp.email
    tmd["person_title"] = emp.title
    return tmd


@router.delete("/teams/{team_id}/members/{person_id}", status_code=204)
async def remove_team_member(
    team_id: str,
    person_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    tm = await db.scalar(
        select(TeamMember).where(
            TeamMember.org_id == org.id,
            TeamMember.team_id == team_id,
            TeamMember.person_id == person_id,
        )
    )
    if tm:
        await db.delete(tm)
        await db.commit()


# -------------------------------------------------------------
# PROJECTS & PROJECT MEMBERS
# -------------------------------------------------------------

@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    projects = (await db.scalars(select(Project).where(Project.org_id == org.id).order_by(Project.created_at.desc()))).all()
    out = []
    for p in projects:
        pd = {c.name: getattr(p, c.name) for c in Project.__table__.columns}
        pd["members_count"] = (await db.scalar(select(func.count(ProjectMember.id)).where(ProjectMember.project_id == p.id))) or 0
        out.append(pd)
    return out


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


@router.get("/projects/{project_id}/members", response_model=List[ProjectMemberRead])
async def list_project_members(
    project_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    await _owned(db, Project, project_id, org.id)
    query = (
        select(ProjectMember, Employee.full_name, Employee.email, Employee.title)
        .join(Employee, ProjectMember.person_id == Employee.id)
        .where(ProjectMember.project_id == project_id, ProjectMember.org_id == org.id)
        .order_by(ProjectMember.created_at.asc())
    )
    results = (await db.execute(query)).all()
    out = []
    for pm, name, email, title in results:
        pmd = {c.name: getattr(pm, c.name) for c in ProjectMember.__table__.columns}
        pmd["person_name"] = name
        pmd["person_email"] = email
        pmd["person_title"] = title
        out.append(pmd)
    return out


@router.post("/projects/{project_id}/members", status_code=201, response_model=ProjectMemberRead)
async def add_project_member(
    project_id: str,
    data: ProjectMemberCreate,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    """Explicitly allocate a person to a project with allocation percent and hours/week."""
    await _owned(db, Project, project_id, org.id)
    emp = await _owned(db, Employee, data.person_id, org.id)
    if not emp.is_active:
        raise HTTPException(status_code=422, detail="Cannot allocate inactive teammate to project")

    existing = await db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.person_id == data.person_id)
    )
    if existing:
        existing.role = data.role
        existing.allocation_percent = data.allocation_percent
        existing.hours_per_week = data.hours_per_week
        existing.start_date = data.start_date
        existing.end_date = data.end_date
        pm = existing
    else:
        pm = ProjectMember(org_id=org.id, project_id=project_id, **data.model_dump())
        db.add(pm)
    await db.commit()
    await db.refresh(pm)
    pmd = {c.name: getattr(pm, c.name) for c in ProjectMember.__table__.columns}
    pmd["person_name"] = emp.full_name
    pmd["person_email"] = emp.email
    pmd["person_title"] = emp.title
    return pmd


@router.patch("/projects/{project_id}/members/{person_id}", response_model=ProjectMemberRead)
async def update_project_member(
    project_id: str,
    person_id: str,
    data: ProjectMemberUpdate,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    pm = await db.scalar(
        select(ProjectMember).where(
            ProjectMember.org_id == org.id,
            ProjectMember.project_id == project_id,
            ProjectMember.person_id == person_id,
        )
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Project member allocation not found")
    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(pm, k, v)
    await db.commit()
    await db.refresh(pm)
    emp = await db.scalar(select(Employee).where(Employee.id == person_id))
    pmd = {c.name: getattr(pm, c.name) for c in ProjectMember.__table__.columns}
    pmd["person_name"] = emp.full_name if emp else None
    pmd["person_email"] = emp.email if emp else None
    return pmd


@router.delete("/projects/{project_id}/members/{person_id}", status_code=204)
async def remove_project_member(
    project_id: str,
    person_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.OWNER])),
):
    pm = await db.scalar(
        select(ProjectMember).where(
            ProjectMember.org_id == org.id,
            ProjectMember.project_id == project_id,
            ProjectMember.person_id == person_id,
        )
    )
    if pm:
        await db.delete(pm)
        await db.commit()


# -------------------------------------------------------------
# TASKS & COMPATIBILITY
# -------------------------------------------------------------

@router.get("/tasks", response_model=list[TaskRead])
async def list_all_tasks(
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    project_id: str | None = Query(default=None, alias="project_id"),
    assignee_id: str | None = Query(default=None, alias="assignee_id"),
    status: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None, alias="priority"),
    q: str | None = Query(default=None, alias="q"),
):
    query = select(ProjectTask).where(ProjectTask.org_id == org.id)
    if project_id:
        await _owned(db, Project, project_id, org.id)
        query = query.where(ProjectTask.project_id == project_id)
    if assignee_id:
        await _owned(db, Employee, assignee_id, org.id)
        # Search both legacy column and TaskAssignee table
        query = query.outerjoin(TaskAssignee, TaskAssignee.task_id == ProjectTask.id).where(
            or_(ProjectTask.assignee_id == assignee_id, TaskAssignee.person_id == assignee_id)
        ).distinct()
    if status:
        if status not in VALID_TASK_STATUSES:
            raise HTTPException(status_code=422, detail="Unsupported task status")
        query = query.where(ProjectTask.status == status)
    if priority:
        if priority not in VALID_TASK_PRIORITIES:
            raise HTTPException(status_code=422, detail="Unsupported task priority")
        query = query.where(ProjectTask.priority == priority)
    if q:
        query = query.where(ProjectTask.title.ilike(f"%{q}%"))

    tasks = (await db.scalars(query.order_by(ProjectTask.created_at.desc()))).all()
    return [await _task_out(db, t) for t in tasks]


@router.get("/projects/{project_id}/tasks", response_model=list[TaskRead])
async def list_tasks(project_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _owned(db, Project, project_id, org.id)
    tasks = (await db.scalars(select(ProjectTask).where(ProjectTask.org_id == org.id, ProjectTask.project_id == project_id).order_by(ProjectTask.created_at))).all()
    return [await _task_out(db, t) for t in tasks]


@router.post("/projects/{project_id}/tasks", response_model=TaskRead, status_code=201)
async def create_task(
    project_id: str,
    data: TaskCreate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned(db, Project, project_id, org.id)
    if data.assignee_id:
        await _owned(db, Employee, data.assignee_id, org.id)
    if data.status not in VALID_TASK_STATUSES: raise HTTPException(status_code=422, detail="Unsupported task status")
    if data.priority not in VALID_TASK_PRIORITIES: raise HTTPException(status_code=422, detail="Unsupported task priority")

    next_number = (await db.scalar(select(func.max(ProjectTask.task_number)).where(ProjectTask.org_id == org.id, ProjectTask.project_id == project_id))) or 0
    row = ProjectTask(org_id=org.id, project_id=project_id, task_number=next_number + 1, **data.model_dump())
    if row.status == "done" and row.completed_at is None:
        row.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    await db.flush()

    # If assignee_id specified, sync into TaskAssignee (ensuring project membership or auto-linking if owner)
    if data.assignee_id:
        # Check project membership; if not present, auto-add as contributor for frictionless creation
        pm = await db.scalar(select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.person_id == data.assignee_id))
        if not pm:
            db.add(ProjectMember(org_id=org.id, project_id=project_id, person_id=data.assignee_id, role="contributor"))
            await db.flush()
        db.add(TaskAssignee(
            org_id=org.id,
            task_id=row.id,
            person_id=data.assignee_id,
            role="owner",
            assigned_by=user.id,
            assigned_at=datetime.now(timezone.utc),
        ))

    await db.commit()
    await db.refresh(row)
    return await _task_out(db, row)


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(task_id: str, data: TaskUpdate, org: Organization = Depends(get_current_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, ProjectTask, task_id, org.id)
    changes = data.model_dump(exclude_unset=True)
    if "assignee_id" in changes and changes["assignee_id"] is not None:
        await _owned(db, Employee, changes["assignee_id"], org.id)
        # Sync TaskAssignee
        new_assignee_id = changes["assignee_id"]
        # Ensure project membership
        pm = await db.scalar(select(ProjectMember).where(ProjectMember.project_id == row.project_id, ProjectMember.person_id == new_assignee_id))
        if not pm:
            db.add(ProjectMember(org_id=org.id, project_id=row.project_id, person_id=new_assignee_id, role="contributor"))
            await db.flush()
        # Demote existing owners
        other_owners = (await db.scalars(select(TaskAssignee).where(TaskAssignee.task_id == row.id, TaskAssignee.role == "owner", TaskAssignee.person_id != new_assignee_id))).all()
        for o in other_owners: o.role = "contributor"
        # Upsert new owner
        ta = await db.scalar(select(TaskAssignee).where(TaskAssignee.task_id == row.id, TaskAssignee.person_id == new_assignee_id))
        if ta:
            ta.role = "owner"
        else:
            db.add(TaskAssignee(org_id=org.id, task_id=row.id, person_id=new_assignee_id, role="owner", assigned_by=user.id, assigned_at=datetime.now(timezone.utc)))

    if "status" in changes and changes["status"] not in VALID_TASK_STATUSES: raise HTTPException(status_code=422, detail="Unsupported task status")
    if "priority" in changes and changes["priority"] not in VALID_TASK_PRIORITIES: raise HTTPException(status_code=422, detail="Unsupported task priority")
    for key, value in changes.items(): setattr(row, key, value)
    if row.status == "done" and row.completed_at is None:
        row.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif row.status != "done":
        row.completed_at = None
    await db.commit(); await db.refresh(row); return await _task_out(db, row)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, ProjectTask, task_id, org.id)
    if await db.scalar(select(TimeEntry.id).where(TimeEntry.org_id == org.id, TimeEntry.task_id == row.id).limit(1)):
        raise HTTPException(status_code=409, detail="Tasks with time history cannot be deleted")
    await db.delete(row); await db.commit()


# -------------------------------------------------------------
# TIMESHEETS
# -------------------------------------------------------------

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
async def approve_time_entry(entry_id: str, data: dict, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE]))):
    status_value = data.get("status")
    if status_value not in ("approved", "rejected"): raise HTTPException(status_code=422, detail="Status must be approved or rejected")
    row = await _owned(db, TimeEntry, entry_id, org.id)
    row.approval_status = status_value
    row.reviewed_by_user_id = user.id
    row.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if status_value == "rejected":
        row.rejection_reason = data.get("rejection_reason") or "Rejected by reviewer"
    else:
        row.rejection_reason = None
    await db.commit(); await db.refresh(row); return row


# -------------------------------------------------------------
# LEAVE MANAGEMENT & TYPES
# -------------------------------------------------------------

@router.get("/leave-types", response_model=List[LeaveTypeRead])
async def list_leave_types(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    types = (await db.scalars(select(LeaveType).where(LeaveType.org_id == org.id, LeaveType.is_active == True).order_by(LeaveType.name))).all()
    if not types:
        # Seed default leave types if empty
        defaults = [
            ("Annual Leave", "annual", 20, True),
            ("Sick Leave", "sick", 10, True),
            ("Unpaid Leave", "unpaid", 0, False),
        ]
        types = []
        for name, code, days, paid in defaults:
            lt = LeaveType(org_id=org.id, name=name, code=code, default_days_per_year=days, is_paid=paid, is_active=True)
            db.add(lt)
            types.append(lt)
        await db.commit()
        for lt in types: await db.refresh(lt)
    return types


@router.post("/leave-types", response_model=LeaveTypeRead, status_code=201)
async def create_leave_type(data: LeaveTypeCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.OWNER, RoleType.FINANCE]))):
    existing = await db.scalar(select(LeaveType).where(LeaveType.org_id == org.id, LeaveType.code == data.code))
    if existing:
        raise HTTPException(status_code=409, detail=f"Leave type code '{data.code}' already exists")
    lt = LeaveType(org_id=org.id, **data.model_dump())
    db.add(lt)
    await db.commit()
    await db.refresh(lt)
    return lt


@router.get("/leave-balances", response_model=List[LeaveBalanceRead])
async def list_leave_balances(
    employee_id: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    yr = year or date.today().year
    query = (
        select(LeaveBalance, LeaveType.name, LeaveType.code)
        .join(LeaveType, LeaveBalance.leave_type_id == LeaveType.id)
        .where(LeaveBalance.org_id == org.id, LeaveBalance.year == yr)
    )
    if employee_id:
        await _owned(db, Employee, employee_id, org.id)
        query = query.where(LeaveBalance.person_id == employee_id)
    else:
        # If no employee specified, return current user's employee balance if found
        emp = await db.scalar(select(Employee).where(Employee.org_id == org.id, Employee.user_id == user.id))
        if emp:
            query = query.where(LeaveBalance.person_id == emp.id)

    results = (await db.execute(query)).all()
    out = []
    for b, name, code in results:
        bd = {c.name: getattr(b, c.name) for c in LeaveBalance.__table__.columns}
        bd["leave_type_name"] = name
        bd["leave_type_code"] = code
        bd["remaining_days"] = max(0.0, b.allocated_days - b.used_days)
        out.append(bd)
    return out


@router.get("/leave-calendar", response_model=List[LeaveCalendarEventRead])
async def get_leave_calendar(
    team_id: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve approved leaves for team calendar visualization."""
    s_date = start_date or (date.today() - timedelta(days=30))
    e_date = end_date or (date.today() + timedelta(days=90))

    query = (
        select(LeaveRequest, Employee.full_name)
        .join(Employee, LeaveRequest.employee_id == Employee.id)
        .where(
            LeaveRequest.org_id == org.id,
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= e_date,
            LeaveRequest.end_date >= s_date,
        )
    )
    if team_id:
        team_people = select(TeamMember.person_id).where(TeamMember.team_id == team_id)
        query = query.where(LeaveRequest.employee_id.in_(team_people))

    results = (await db.execute(query)).all()
    out = []
    for lr, name in results:
        out.append({
            "id": lr.id,
            "employee_id": lr.employee_id,
            "employee_name": name,
            "leave_type": lr.leave_type,
            "start_date": lr.start_date,
            "end_date": lr.end_date,
            "days": lr.days_computed or float(lr.working_days),
            "is_half_day": lr.is_half_day,
            "status": lr.status,
        })
    return out


@router.get("/leave-requests", response_model=list[LeaveRead])
async def list_leave_requests(
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    query = select(LeaveRequest).where(LeaveRequest.org_id == org.id)
    if employee_id:
        query = query.where(LeaveRequest.employee_id == employee_id)
    if status and status != "all":
        query = query.where(LeaveRequest.status == status)
    return (await db.scalars(query.order_by(LeaveRequest.created_at.desc()))).all()


@router.post("/leave-requests", response_model=LeaveRead, status_code=201)
async def create_leave_request(
    data: LeaveCreate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create leave request with working days calculation and overlap verification."""
    return await LeaveService.create_request(
        db=db,
        org_id=org.id,
        employee_id=data.employee_id,
        start_date=data.start_date,
        end_date=data.end_date,
        leave_type_id=data.leave_type_id,
        leave_type_code=data.leave_type,
        is_half_day=data.is_half_day,
        half_day_period=data.half_day_period,
        reason=data.reason,
        actor_user_id=user.id,
    )


@router.post("/leave-requests/{request_id}/decision", response_model=LeaveRead)
async def decide_leave_request(
    request_id: str,
    data: LeaveDecisionRequest,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.OWNER])),
):
    """Approve, reject, or cancel a leave request with self-approval checks and task conflict flagging."""
    return await LeaveService.decide_request(
        db=db,
        org_id=org.id,
        request_id=request_id,
        decision=data.decision,
        reviewer_user=user,
        decision_note=data.decision_note,
    )


@router.patch("/leave-requests/{request_id}", response_model=LeaveRead)
async def update_leave_request(
    request_id: str,
    data: LeaveUpdate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    row = await _owned(db, LeaveRequest, request_id, org.id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Reviewed leave requests cannot be edited")

    changes = data.model_dump(exclude_unset=True)
    start_date = changes.get("start_date", row.start_date)
    end_date = changes.get("end_date", row.end_date)
    is_half_day = changes.get("is_half_day", row.is_half_day)

    if end_date < start_date:
        raise HTTPException(status_code=422, detail="End date must be on or after start date")

    # If dates changed, recalculate working days and check overlap
    if "start_date" in changes or "end_date" in changes or "is_half_day" in changes:
        days = LeaveService.count_working_days(start_date, end_date, is_half_day=is_half_day)
        if days <= 0:
            raise HTTPException(status_code=422, detail="Selected date range contains 0 working days")
        await LeaveService.validate_no_overlap(db, org.id, row.employee_id, start_date, end_date, exclude_id=row.id)
        row.days_computed = days
        row.working_days = int(days)

    for key, value in changes.items():
        setattr(row, key, value)

    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/leave-requests/{request_id}", status_code=204)
async def delete_leave_request(request_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, LeaveRequest, request_id, org.id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Reviewed leave requests cannot be deleted")
    await db.delete(row)
    await db.commit()
