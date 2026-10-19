"""Assignment API router providing task assignee management, project member verification,
capacity workload analysis, leave conflict detection, and smart assignee suggestions.
"""

from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    get_current_tenant, get_current_user, get_current_membership, require_role
)
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.operations import ProjectTask, TaskAssignee, Employee, ProjectMember
from app.schemas.operations import (
    TaskAssigneeCreate, TaskAssigneeUpdate, TaskAssigneeRead, TaskRead
)
from app.schemas.assignments import (
    AssigneeSuggestionRead, CapacitySummaryRead, PersonLoadRead,
    BulkAssignRequest, BulkAssignResult
)
from app.services.assignment_service import AssignmentService

router = APIRouter()


async def _get_owned_task(db: AsyncSession, task_id: str, org_id: str) -> ProjectTask:
    task = await db.scalar(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.org_id == org_id)
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/tasks/{task_id}/assignees", response_model=List[TaskAssigneeRead])
async def list_task_assignees(
    task_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.EMPLOYEE, RoleType.APPROVER, RoleType.FINANCE, RoleType.SALES])),
):
    """List all assignees (owner, contributors, reviewers) for a task."""
    await _get_owned_task(db, task_id, org.id)
    query = (
        select(TaskAssignee, Employee.full_name, Employee.email)
        .join(Employee, TaskAssignee.person_id == Employee.id)
        .where(TaskAssignee.task_id == task_id, TaskAssignee.org_id == org.id)
        .order_by(TaskAssignee.role.asc(), TaskAssignee.created_at.asc())
    )
    results = (await db.execute(query)).all()
    out = []
    for assignee, name, email in results:
        data = {column.name: getattr(assignee, column.name) for column in TaskAssignee.__table__.columns}
        data["person_name"] = name
        data["person_email"] = email
        out.append(data)
    return out


@router.post("/tasks/{task_id}/assignees", status_code=201, response_model=TaskAssigneeRead)
async def assign_task_member(
    task_id: str,
    data: TaskAssigneeCreate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER])),
):
    """Assign an active project member to a task with leave conflict check and legacy column sync."""
    assignee, conflict = await AssignmentService.assign_task(
        db=db,
        org_id=org.id,
        task_id=task_id,
        person_id=data.person_id,
        role=data.role,
        assigned_by_user_id=user.id,
        override_leave_conflict=data.override_leave_conflict,
    )
    person = await db.scalar(select(Employee).where(Employee.id == data.person_id, Employee.org_id == org.id))
    resp = {column.name: getattr(assignee, column.name) for column in TaskAssignee.__table__.columns}
    resp["person_name"] = person.full_name if person else None
    resp["person_email"] = person.email if person else None
    return resp


@router.patch("/tasks/{task_id}/assignees/{person_id}", response_model=TaskAssigneeRead)
async def update_task_assignee_role(
    task_id: str,
    person_id: str,
    data: TaskAssigneeUpdate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER])),
):
    """Change the role of an existing task assignee (owner, contributor, reviewer)."""
    assignee, _ = await AssignmentService.assign_task(
        db=db,
        org_id=org.id,
        task_id=task_id,
        person_id=person_id,
        role=data.role,
        assigned_by_user_id=user.id,
        override_leave_conflict=True,
    )
    person = await db.scalar(select(Employee).where(Employee.id == person_id, Employee.org_id == org.id))
    resp = {column.name: getattr(assignee, column.name) for column in TaskAssignee.__table__.columns}
    resp["person_name"] = person.full_name if person else None
    resp["person_email"] = person.email if person else None
    return resp


@router.delete("/tasks/{task_id}/assignees/{person_id}", status_code=204)
async def unassign_task_member(
    task_id: str,
    person_id: str,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER])),
):
    """Unassign a teammate from a task."""
    await AssignmentService.unassign_task(
        db=db,
        org_id=org.id,
        task_id=task_id,
        person_id=person_id,
        user_id=user.id,
    )


@router.post("/bulk", response_model=BulkAssignResult)
async def bulk_assign_tasks(
    data: BulkAssignRequest,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER])),
):
    """Assign multiple tasks in a single transaction with conflict warnings."""
    out_assignees = []
    warnings = []
    for item in data.assignments:
        try:
            assignee, conflict = await AssignmentService.assign_task(
                db=db,
                org_id=org.id,
                task_id=item.task_id,
                person_id=item.person_id,
                role=item.role,
                assigned_by_user_id=user.id,
                override_leave_conflict=item.override_leave_conflict,
            )
            person = await db.scalar(select(Employee).where(Employee.id == item.person_id, Employee.org_id == org.id))
            resp = {column.name: getattr(assignee, column.name) for column in TaskAssignee.__table__.columns}
            resp["person_name"] = person.full_name if person else None
            resp["person_email"] = person.email if person else None
            out_assignees.append(resp)
            if conflict.get("has_conflict"):
                warnings.append(conflict.get("message", "Leave conflict overridden."))
        except HTTPException as e:
            warnings.append(f"Task {item.task_id}: {e.detail}")

    return BulkAssignResult(
        assigned_count=len(out_assignees),
        warnings=warnings,
        assignments=out_assignees,
    )


@router.get("/tasks/{task_id}/suggestions", response_model=List[AssigneeSuggestionRead])
async def get_task_assignee_suggestions(
    task_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.EMPLOYEE])),
):
    """Suggest available assignees for a task: project members + team members, sorted by lowest load."""
    return await AssignmentService.suggest_assignees_for_task(db=db, org_id=org.id, task_id=task_id)


@router.get("/capacity", response_model=CapacitySummaryRead)
async def get_capacity_overview(
    days: int = Query(7, ge=1, le=90),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.FINANCE])),
):
    """Calculate capacity and workload across all active people in the organization."""
    people = (await db.scalars(
        select(Employee).where(Employee.org_id == org.id, Employee.is_active == True)
    )).all()

    today = date.today()
    window_end = today + timedelta(days=days)

    loads: List[PersonLoadRead] = []
    for p in people:
        load_data = await AssignmentService.calculate_person_load(db, org.id, p.id, window_days=days)
        loads.append(PersonLoadRead(**load_data))

    total_cap = sum(l.weekly_capacity_hours for l in loads)
    total_alloc = sum(l.total_estimated_hours for l in loads)
    avg_load = round((total_alloc / total_cap * 100.0) if total_cap > 0 else 0.0, 1)
    overloaded_count = sum(1 for l in loads if l.is_overloaded)

    return CapacitySummaryRead(
        window_start=today,
        window_end=window_end,
        total_capacity_hours=total_cap,
        total_allocated_hours=total_alloc,
        average_load_percent=avg_load,
        overloaded_people_count=overloaded_count,
        people=loads,
    )


@router.get("/tasks/needs-reassignment", response_model=List[TaskRead])
async def get_tasks_needing_reassignment(
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.EMPLOYEE])),
):
    """List all open tasks flagged as 'needs_reassignment' due to approved leave conflicts."""
    tasks = (await db.scalars(
        select(ProjectTask).where(
            ProjectTask.org_id == org.id,
            ProjectTask.needs_reassignment == True,
            ProjectTask.status != "done",
        ).order_by(ProjectTask.due_date.asc())
    )).all()
    out = []
    for t in tasks:
        td = {column.name: getattr(t, column.name) for column in ProjectTask.__table__.columns}
        # Fetch assignees
        assignees = (await db.execute(
            select(TaskAssignee, Employee.full_name, Employee.email)
            .join(Employee, TaskAssignee.person_id == Employee.id)
            .where(TaskAssignee.task_id == t.id, TaskAssignee.org_id == org.id)
        )).all()
        td["assignees"] = [
            {**{col.name: getattr(a, col.name) for col in TaskAssignee.__table__.columns},
             "person_name": name, "person_email": email}
            for a, name, email in assignees
        ]
        out.append(td)
    return out


@router.post("/tasks/{task_id}/clear-reassignment-flag", status_code=200)
async def clear_task_reassignment_flag(
    task_id: str,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.PROJECT_MANAGER, RoleType.APPROVER])),
):
    """Explicitly clear the 'needs_reassignment' flag on a task."""
    task = await _get_owned_task(db, task_id, org.id)
    task.needs_reassignment = False
    await db.commit()
    return {"id": task_id, "needs_reassignment": False}
