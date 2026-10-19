"""Assignment service handling project membership verification, task assignments,
leave conflict checks, capacity computation, and assignee suggestions.
"""

from datetime import date, datetime, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any
from fastapi import HTTPException
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operations import (
    Employee, Project, ProjectTask, ProjectMember, TaskAssignee,
    LeaveRequest, TeamMember, Team
)
from app.services.audit_service import AuditService


class AssignmentService:

    @staticmethod
    async def is_project_member(
        db: AsyncSession,
        org_id: str,
        project_id: str,
        person_id: str,
    ) -> bool:
        """Verify whether an active person is a member of the project."""
        member = await db.scalar(
            select(ProjectMember).where(
                ProjectMember.org_id == org_id,
                ProjectMember.project_id == project_id,
                ProjectMember.person_id == person_id,
            )
        )
        return member is not None

    @staticmethod
    async def check_leave_conflict(
        db: AsyncSession,
        org_id: str,
        person_id: str,
        task_due_date: Optional[date],
        task_start_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """Check if a task's window overlaps with any approved or pending leave for the person."""
        if not task_due_date and not task_start_date:
            return {"has_conflict": False}

        w_start = task_start_date or task_due_date
        w_end = task_due_date or task_start_date
        if w_start > w_end:
            w_start, w_end = w_end, w_start

        # Query overlapping leaves
        query = select(LeaveRequest).where(
            LeaveRequest.org_id == org_id,
            LeaveRequest.employee_id == person_id,
            LeaveRequest.status.in_(["approved", "pending"]),
            LeaveRequest.start_date <= w_end,
            LeaveRequest.end_date >= w_start,
        ).order_by(LeaveRequest.status.asc())  # 'approved' precedes 'pending'

        leaves = (await db.scalars(query)).all()
        if not leaves:
            return {"has_conflict": False}

        # Check approved first
        approved_leave = next((l for l in leaves if l.status == "approved"), None)
        if approved_leave:
            return {
                "has_conflict": True,
                "conflict_type": "APPROVED",
                "code": "LEAVE_CONFLICT",
                "leave_start": approved_leave.start_date,
                "leave_end": approved_leave.end_date,
                "reason": approved_leave.reason,
                "message": (
                    f"Assignee has approved leave ({approved_leave.start_date} to "
                    f"{approved_leave.end_date}) overlapping the task window."
                ),
            }

        pending_leave = leaves[0]
        return {
            "has_conflict": True,
            "conflict_type": "PENDING",
            "code": "LEAVE_PENDING_WARNING",
            "leave_start": pending_leave.start_date,
            "leave_end": pending_leave.end_date,
            "reason": pending_leave.reason,
            "message": (
                f"Assignee has pending leave ({pending_leave.start_date} to "
                f"{pending_leave.end_date}) during the task window."
            ),
        }

    @staticmethod
    async def calculate_person_load(
        db: AsyncSession,
        org_id: str,
        person_id: str,
        window_days: int = 7,
    ) -> Dict[str, Any]:
        """Compute person's workload: open task estimated hours vs weekly capacity minus leave."""
        person = await db.scalar(
            select(Employee).where(Employee.id == person_id, Employee.org_id == org_id)
        )
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")

        # Open tasks assigned to person
        task_query = select(ProjectTask).join(
            TaskAssignee, TaskAssignee.task_id == ProjectTask.id
        ).where(
            TaskAssignee.org_id == org_id,
            TaskAssignee.person_id == person_id,
            ProjectTask.status != "done",
        )
        tasks = (await db.scalars(task_query)).all()

        total_est_minutes = sum(t.estimate_minutes for t in tasks)
        estimated_hours = round(total_est_minutes / 60.0, 1)

        weekly_capacity_hours = round(person.weekly_capacity_minutes / 60.0, 1)

        # Approved leave in current week
        today = date.today()
        week_end = today + timedelta(days=window_days)
        leave_query = select(LeaveRequest).where(
            LeaveRequest.org_id == org_id,
            LeaveRequest.employee_id == person_id,
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= week_end,
            LeaveRequest.end_date >= today,
        )
        approved_leaves = (await db.scalars(leave_query)).all()
        leave_days = sum(l.days_computed or l.working_days for l in approved_leaves)
        leave_hours = round(leave_days * 8.0, 1)

        net_capacity_hours = max(0.0, weekly_capacity_hours - leave_hours)
        if net_capacity_hours > 0:
            load_percent = round((estimated_hours / net_capacity_hours) * 100.0, 1)
        else:
            load_percent = 999.0 if estimated_hours > 0 else 0.0

        return {
            "person_id": person_id,
            "person_name": person.full_name,
            "weekly_capacity_hours": weekly_capacity_hours,
            "open_tasks_count": len(tasks),
            "total_estimated_hours": estimated_hours,
            "approved_leave_hours": leave_hours,
            "net_capacity_hours": net_capacity_hours,
            "load_percent": load_percent,
            "is_overloaded": load_percent > 100.0,
        }

    @staticmethod
    async def assign_task(
        db: AsyncSession,
        org_id: str,
        task_id: str,
        person_id: str,
        role: str = "contributor",
        assigned_by_user_id: Optional[str] = None,
        override_leave_conflict: bool = False,
    ) -> Tuple[TaskAssignee, Dict[str, Any]]:
        """Assign an active project member to a task with leave conflict check and legacy column sync."""
        task = await db.scalar(
            select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.org_id == org_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        person = await db.scalar(
            select(Employee).where(Employee.id == person_id, Employee.org_id == org_id)
        )
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        if not person.is_active:
            raise HTTPException(status_code=422, detail="Cannot assign inactive teammate")

        # Rule: A task can only be assigned to a member of the task's project
        is_member = await AssignmentService.is_project_member(db, org_id, task.project_id, person_id)
        if not is_member:
            raise HTTPException(
                status_code=422,
                detail="Person is not a member of the task's project. Please add them to the project first."
            )

        # Rule: Leave conflict check
        conflict = await AssignmentService.check_leave_conflict(
            db, org_id, person_id, task.due_date, task.start_date
        )
        if conflict["has_conflict"] and conflict.get("code") == "LEAVE_CONFLICT":
            if not override_leave_conflict:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "LEAVE_CONFLICT",
                        "message": conflict["message"],
                        "leave_start": str(conflict["leave_start"]),
                        "leave_end": str(conflict["leave_end"]),
                        "reason": conflict.get("reason"),
                    }
                )

        # Check existing assignment
        existing = await db.scalar(
            select(TaskAssignee).where(
                TaskAssignee.org_id == org_id,
                TaskAssignee.task_id == task_id,
                TaskAssignee.person_id == person_id,
            )
        )

        # Owner exclusivity: Exactly one owner per task at most
        if role == "owner":
            # Demote any other owner to contributor
            other_owners = (await db.scalars(
                select(TaskAssignee).where(
                    TaskAssignee.org_id == org_id,
                    TaskAssignee.task_id == task_id,
                    TaskAssignee.role == "owner",
                    TaskAssignee.person_id != person_id,
                )
            )).all()
            for other in other_owners:
                other.role = "contributor"
            # Keep legacy single-assignee column in sync
            task.assignee_id = person_id

        if existing:
            existing.role = role
            existing.assigned_by = assigned_by_user_id
            existing.assigned_at = datetime.now(timezone.utc)
            assignee = existing
        else:
            assignee = TaskAssignee(
                org_id=org_id,
                task_id=task_id,
                person_id=person_id,
                role=role,
                assigned_by=assigned_by_user_id,
                assigned_at=datetime.now(timezone.utc),
            )
            db.add(assignee)

        # If task was flagged for reassignment and new assignment doesn't have an approved conflict
        if task.needs_reassignment and not (conflict["has_conflict"] and conflict.get("code") == "LEAVE_CONFLICT"):
            task.needs_reassignment = False

        await db.flush()

        # Audit log
        await AuditService.log_action(
            db=db,
            org_id=org_id,
            user_id=assigned_by_user_id,
            action="task.assignee_added",
            entity_type="task",
            entity_id=task_id,
            details={
                "person_id": person_id,
                "person_name": person.full_name,
                "role": role,
                "override_leave_conflict": override_leave_conflict,
                "conflict_warning": conflict.get("message") if conflict.get("has_conflict") else None,
            },
        )

        await db.commit()
        await db.refresh(assignee)
        return assignee, conflict

    @staticmethod
    async def unassign_task(
        db: AsyncSession,
        org_id: str,
        task_id: str,
        person_id: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Remove an assignee from a task and update legacy column if unassigning the owner."""
        task = await db.scalar(
            select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.org_id == org_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        assignee = await db.scalar(
            select(TaskAssignee).where(
                TaskAssignee.org_id == org_id,
                TaskAssignee.task_id == task_id,
                TaskAssignee.person_id == person_id,
            )
        )
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignment not found")

        if assignee.role == "owner":
            # Check if there is another assignee we can promote, or set null
            other_assignee = await db.scalar(
                select(TaskAssignee).where(
                    TaskAssignee.org_id == org_id,
                    TaskAssignee.task_id == task_id,
                    TaskAssignee.person_id != person_id,
                )
            )
            if other_assignee:
                other_assignee.role = "owner"
                task.assignee_id = other_assignee.person_id
            else:
                task.assignee_id = None

        await db.delete(assignee)
        await db.flush()

        await AuditService.log_action(
            db=db,
            org_id=org_id,
            user_id=user_id,
            action="task.assignee_removed",
            entity_type="task",
            entity_id=task_id,
            details={"person_id": person_id},
        )
        await db.commit()

    @staticmethod
    async def suggest_assignees_for_task(
        db: AsyncSession,
        org_id: str,
        task_id: str,
    ) -> List[Dict[str, Any]]:
        """Suggest available assignees for a task: project members + team members, sorted by lowest load first."""
        task = await db.scalar(
            select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.org_id == org_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # 1. Project members
        project_members = (await db.scalars(
            select(ProjectMember).where(
                ProjectMember.org_id == org_id,
                ProjectMember.project_id == task.project_id,
            )
        )).all()
        pm_person_ids = {pm.person_id for pm in project_members}

        # 2. People in the same team as existing assignees or project
        assigned_people_ids = (await db.scalars(
            select(TaskAssignee.person_id).where(
                TaskAssignee.org_id == org_id,
                TaskAssignee.task_id == task_id,
            )
        )).all()

        same_team_person_ids = set()
        if assigned_people_ids:
            # Find their teams
            team_ids = (await db.scalars(
                select(TeamMember.team_id).where(
                    TeamMember.org_id == org_id,
                    TeamMember.person_id.in_(assigned_people_ids),
                )
            )).all()
            if team_ids:
                team_colleagues = (await db.scalars(
                    select(TeamMember.person_id).where(
                        TeamMember.org_id == org_id,
                        TeamMember.team_id.in_(team_ids),
                    )
                )).all()
                same_team_person_ids = set(team_colleagues)

        # Candidate pool: all active people in the organization
        active_people = (await db.scalars(
            select(Employee).where(Employee.org_id == org_id, Employee.is_active == True)
        )).all()

        suggestions = []
        for person in active_people:
            is_pm = person.id in pm_person_ids
            is_st = person.id in same_team_person_ids

            load_info = await AssignmentService.calculate_person_load(db, org_id, person.id)
            conflict_info = await AssignmentService.check_leave_conflict(
                db, org_id, person.id, task.due_date, task.start_date
            )

            has_approved_conflict = (
                conflict_info.get("has_conflict")
                and conflict_info.get("code") == "LEAVE_CONFLICT"
            )

            is_rec = is_pm and not has_approved_conflict and not load_info["is_overloaded"]

            suggestions.append({
                "person_id": person.id,
                "person_name": person.full_name,
                "person_email": person.email,
                "person_title": person.title,
                "is_project_member": is_pm,
                "is_same_team": is_st,
                "load_percent": load_info["load_percent"],
                "open_tasks_count": load_info["open_tasks_count"],
                "open_estimated_hours": load_info["total_estimated_hours"],
                "has_leave_conflict": conflict_info.get("has_conflict", False),
                "conflict_code": conflict_info.get("code"),
                "conflict_message": conflict_info.get("message"),
                "is_recommended": is_rec,
            })

        # Sort order:
        # 1. Project members first
        # 2. No approved conflict first
        # 3. Lowest load percent
        suggestions.sort(
            key=lambda s: (
                0 if s["is_project_member"] else 1,
                1 if (s["has_leave_conflict"] and s["conflict_code"] == "LEAVE_CONFLICT") else 0,
                s["load_percent"],
            )
        )
        return suggestions
