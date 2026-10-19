"""Leave service managing leave requests, working days calculation,
balance tracking, approval workflow, and task reassignment notifications.
"""

from datetime import date, datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operations import (
    Employee, LeaveRequest, LeaveType, LeaveBalance,
    ProjectTask, TaskAssignee, Team, TeamMember
)
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.services.audit_service import AuditService


class LeaveService:

    @staticmethod
    def count_working_days(start_date: date, end_date: date, is_half_day: bool = False) -> float:
        """Calculate working days between two dates, excluding weekends (Saturday and Sunday)."""
        if end_date < start_date:
            return 0.0

        days_count = 0
        current = start_date
        while current <= end_date:
            if current.weekday() < 5:  # Monday to Friday
                days_count += 1
            current += timedelta(days=1)

        if is_half_day:
            return 0.5 if days_count >= 1 else 0.0

        return float(days_count)

    @staticmethod
    async def validate_no_overlap(
        db: AsyncSession,
        org_id: str,
        employee_id: str,
        start_date: date,
        end_date: date,
        exclude_id: Optional[str] = None,
    ) -> None:
        """Ensure the employee has no overlapping active/pending leave requests."""
        query = select(LeaveRequest).where(
            LeaveRequest.org_id == org_id,
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status.in_(["pending", "approved"]),
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
        if exclude_id:
            query = query.where(LeaveRequest.id != exclude_id)

        overlapping = (await db.scalars(query)).first()
        if overlapping:
            raise HTTPException(
                status_code=409,
                detail=f"Leave request overlaps with existing {overlapping.status} leave from {overlapping.start_date} to {overlapping.end_date}."
            )

    @staticmethod
    async def get_or_create_balance(
        db: AsyncSession,
        org_id: str,
        employee_id: str,
        leave_type_id: str,
        year: int,
    ) -> LeaveBalance:
        """Fetch or create leave balance record for the person and leave type."""
        balance = await db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.org_id == org_id,
                LeaveBalance.person_id == employee_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.year == year,
            )
        )
        if not balance:
            leave_type = await db.scalar(
                select(LeaveType).where(LeaveType.id == leave_type_id, LeaveType.org_id == org_id)
            )
            default_days = leave_type.default_days_per_year if leave_type else 20
            balance = LeaveBalance(
                org_id=org_id,
                person_id=employee_id,
                leave_type_id=leave_type_id,
                year=year,
                allocated_days=float(default_days),
                used_days=0.0,
            )
            db.add(balance)
            await db.flush()
        return balance

    @staticmethod
    async def create_request(
        db: AsyncSession,
        org_id: str,
        employee_id: str,
        start_date: date,
        end_date: date,
        leave_type_id: Optional[str] = None,
        leave_type_code: str = "annual",
        is_half_day: bool = False,
        half_day_period: Optional[str] = None,
        reason: Optional[str] = None,
        actor_user_id: Optional[str] = None,
    ) -> LeaveRequest:
        """Create a new leave request after validation of working days, overlap, and balance."""
        if end_date < start_date:
            raise HTTPException(status_code=422, detail="End date must be on or after start date.")

        working_days = LeaveService.count_working_days(start_date, end_date, is_half_day=is_half_day)
        if working_days <= 0:
            raise HTTPException(status_code=422, detail="Selected date range contains 0 working days.")

        # Ensure employee exists and is active
        emp = await db.scalar(select(Employee).where(Employee.id == employee_id, Employee.org_id == org_id))
        if not emp or not emp.is_active:
            raise HTTPException(status_code=404, detail="Active employee profile not found.")

        # Resolve leave type
        lt = None
        if leave_type_id:
            lt = await db.scalar(select(LeaveType).where(LeaveType.id == leave_type_id, LeaveType.org_id == org_id))
        if not lt:
            lt = await db.scalar(select(LeaveType).where(LeaveType.code == leave_type_code, LeaveType.org_id == org_id))
        if not lt:
            # Fallback create default leave type
            lt = LeaveType(
                org_id=org_id,
                name=leave_type_code.capitalize() + " Leave",
                code=leave_type_code,
                default_days_per_year=20,
                is_paid=True,
                is_active=True,
            )
            db.add(lt)
            await db.flush()

        # Check overlap
        await LeaveService.validate_no_overlap(db, org_id, employee_id, start_date, end_date)

        # Balance check
        if lt.is_paid:
            balance = await LeaveService.get_or_create_balance(db, org_id, employee_id, lt.id, start_date.year)
            remaining = balance.allocated_days - balance.used_days
            if remaining < working_days:
                raise HTTPException(
                    status_code=422,
                    detail=f"Insufficient leave balance: {remaining:.1f} days remaining, {working_days:.1f} days requested."
                )

        req = LeaveRequest(
            org_id=org_id,
            employee_id=employee_id,
            leave_type_id=lt.id,
            leave_type=lt.code,
            start_date=start_date,
            end_date=end_date,
            is_half_day=is_half_day,
            half_day_period=half_day_period,
            days_computed=working_days,
            working_days=int(working_days),
            reason=reason,
            status="pending",
        )
        db.add(req)
        await db.flush()

        await AuditService.log_action(
            db=db,
            org_id=org_id,
            user_id=actor_user_id,
            action="leave.requested",
            entity_type="leave_request",
            entity_id=req.id,
            details={
                "employee_id": employee_id,
                "days": working_days,
                "start_date": str(start_date),
                "end_date": str(end_date),
            },
        )
        await db.commit()
        await db.refresh(req)
        return req

    @staticmethod
    async def decide_request(
        db: AsyncSession,
        org_id: str,
        request_id: str,
        decision: str,  # approved, rejected, cancelled
        reviewer_user: User,
        decision_note: Optional[str] = None,
    ) -> LeaveRequest:
        """Process leave approval/rejection/cancellation with balance accounting and task conflict flagging."""
        req = await db.scalar(
            select(LeaveRequest).where(LeaveRequest.id == request_id, LeaveRequest.org_id == org_id)
        )
        if not req:
            raise HTTPException(status_code=404, detail="Leave request not found.")

        emp = await db.scalar(
            select(Employee).where(Employee.id == req.employee_id, Employee.org_id == org_id)
        )
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        # Rule: A person cannot approve their own request
        if decision == "approved" and emp.user_id and emp.user_id == reviewer_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot approve your own leave request."
            )

        prev_status = req.status
        if decision == "approved":
            if prev_status != "pending":
                raise HTTPException(status_code=409, detail=f"Cannot approve request in '{prev_status}' status.")

            req.status = "approved"
            req.reviewed_by_user_id = reviewer_user.id
            req.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            req.decision_note = decision_note

            # Deduct balance
            if req.leave_type_id:
                balance = await LeaveService.get_or_create_balance(
                    db, org_id, req.employee_id, req.leave_type_id, req.start_date.year
                )
                balance.used_days += req.days_computed

            # Rule: Flag tasks assigned to this person overlapping the leave dates as 'needs_reassignment'
            overlapping_tasks_query = select(ProjectTask).outerjoin(
                TaskAssignee, TaskAssignee.task_id == ProjectTask.id
            ).where(
                ProjectTask.org_id == org_id,
                ProjectTask.status != "done",
                or_(
                    TaskAssignee.person_id == req.employee_id,
                    ProjectTask.assignee_id == req.employee_id,
                ),
                or_(
                    and_(ProjectTask.due_date >= req.start_date, ProjectTask.due_date <= req.end_date),
                    and_(ProjectTask.start_date <= req.end_date, ProjectTask.due_date >= req.start_date),
                ),
            ).distinct()

            affected_tasks = (await db.scalars(overlapping_tasks_query)).all()
            for t in affected_tasks:
                t.needs_reassignment = True
                db.add(t)

            await AuditService.log_action(
                db=db,
                org_id=org_id,
                user_id=reviewer_user.id,
                action="leave.approved",
                entity_type="leave_request",
                entity_id=req.id,
                details={
                    "employee_id": req.employee_id,
                    "affected_tasks_count": len(affected_tasks),
                    "affected_task_ids": [t.id for t in affected_tasks],
                },
            )

        elif decision in ("rejected", "cancelled"):
            if prev_status == "approved":
                # Restore deducted balance
                if req.leave_type_id:
                    balance = await LeaveService.get_or_create_balance(
                        db, org_id, req.employee_id, req.leave_type_id, req.start_date.year
                    )
                    balance.used_days = max(0.0, balance.used_days - req.days_computed)

            req.status = decision
            req.reviewed_by_user_id = reviewer_user.id
            req.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            req.decision_note = decision_note

            await AuditService.log_action(
                db=db,
                org_id=org_id,
                user_id=reviewer_user.id,
                action=f"leave.{decision}",
                entity_type="leave_request",
                entity_id=req.id,
                details={"previous_status": prev_status},
            )
        else:
            raise HTTPException(status_code=422, detail="Invalid decision.")

        await db.commit()
        await db.refresh(req)
        return req
