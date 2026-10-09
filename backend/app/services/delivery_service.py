from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from typing import Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operations import Employee, Project, ProjectTask, TimeEntry


def normalize_status(value: Optional[str]) -> str:
    return (value or "todo").strip().lower()


def normalize_priority(value: Optional[str]) -> str:
    normalized = (value or "medium").strip().lower()
    return normalized if normalized in {"low", "medium", "high", "urgent"} else "medium"


def compute_task_progress(task: ProjectTask, time_entries: Optional[Iterable[TimeEntry]] = None) -> int:
    if task.status == "done":
        return 100
    entries = list(time_entries or [])
    logged_minutes = sum(entry.minutes for entry in entries if entry.task_id == task.id and entry.approval_status != "rejected")
    estimate_minutes = task.estimate_minutes or 0
    if estimate_minutes <= 0:
        return 0
    percentage = int((logged_minutes / estimate_minutes) * 100)
    return min(100, max(0, percentage))


async def get_project_delivery_summary(db: AsyncSession, org_id: str, project_id: str) -> dict:
    project = await db.scalar(select(Project).where(Project.id == project_id, Project.org_id == org_id))
    if project is None:
        raise ValueError("Project not found")

    tasks = (await db.scalars(select(ProjectTask).where(ProjectTask.org_id == org_id, ProjectTask.project_id == project_id))).all()
    times = (await db.scalars(select(TimeEntry).where(TimeEntry.org_id == org_id, TimeEntry.project_id == project_id))).all()

    approved_minutes = sum(entry.minutes for entry in times if entry.approval_status == "approved")
    pending_minutes = sum(entry.minutes for entry in times if entry.approval_status == "pending")
    rejected_minutes = sum(entry.minutes for entry in times if entry.approval_status == "rejected")
    billable_minutes = sum(entry.minutes for entry in times if entry.is_billable)
    total_task_minutes = sum(task.estimate_minutes for task in tasks)

    total_minutes = approved_minutes + pending_minutes + rejected_minutes
    progress = 100 if total_task_minutes <= 0 else min(100, int((total_minutes / total_task_minutes) * 100)) if total_task_minutes else 0

    return {
        "project_id": project_id,
        "project_name": project.name,
        "total_minutes": total_minutes,
        "approved_minutes": approved_minutes,
        "pending_minutes": pending_minutes,
        "rejected_minutes": rejected_minutes,
        "billable_minutes": billable_minutes,
        "task_count": len(tasks),
        "done_count": sum(1 for task in tasks if normalize_status(task.status) == "done"),
        "overdue_count": sum(1 for task in tasks if task.due_date and task.due_date < date.today() and normalize_status(task.status) != "done"),
        "progress_percent": progress,
        "budget_minutes": project.budget_minutes or 0,
        "budget_amount_cents": project.budget_amount_cents or 0,
    }


async def get_team_capacity_summary(db: AsyncSession, org_id: str, employee_ids: Optional[List[str]] = None) -> List[dict]:
    employees_query = select(Employee).where(Employee.org_id == org_id, Employee.is_active.is_(True))
    if employee_ids:
        employees_query = employees_query.where(Employee.id.in_(employee_ids))
    employees = (await db.scalars(employees_query.order_by(Employee.full_name))).all()
    results: List[dict] = []
    for employee in employees:
        times = (await db.scalars(select(TimeEntry).where(TimeEntry.org_id == org_id, TimeEntry.employee_id == employee.id))).all()
        logged_minutes = sum(entry.minutes for entry in times if entry.approval_status != "rejected")
        used_pct = 0 if employee.weekly_capacity_minutes <= 0 else int((logged_minutes / employee.weekly_capacity_minutes) * 100)
        results.append({
            "employee_id": employee.id,
            "full_name": employee.full_name,
            "weekly_capacity_minutes": employee.weekly_capacity_minutes,
            "logged_minutes": logged_minutes,
            "utilization_percent": min(100, max(0, used_pct)),
            "annual_leave_days": employee.annual_leave_days,
        })
    return results


def money_from_cents(amount_cents: int) -> Decimal:
    return (Decimal(amount_cents) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
