from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, Date, DateTime, ForeignKey, Text, UniqueConstraint
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Employee(Base, TimestampMixin):
    __tablename__ = "employees"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    full_name = Column(String(255), nullable=False)
    title = Column(String(120))
    role = Column(String(100))
    email = Column(String(255))
    employment_status = Column(String(50), default="full_time", nullable=False)
    billing_rate_cents = Column(Integer, default=0, nullable=False)
    cost_rate_cents = Column(Integer, default=0, nullable=False)
    weekly_capacity_minutes = Column(Integer, default=2400, nullable=False)
    annual_leave_days = Column(Integer, default=20, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    @property
    def weekly_capacity_hours(self) -> float:
        return self.weekly_capacity_minutes / 60.0


# Person is a full alias of Employee matching domain terminology
Person = Employee


class Team(Base, TimestampMixin):
    __tablename__ = "teams"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    lead_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), index=True)
    is_active = Column(Boolean, default=True, nullable=False)


class TeamMember(Base, TimestampMixin):
    __tablename__ = "team_members"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="member", nullable=False)

    __table_args__ = (
        UniqueConstraint("team_id", "person_id", name="uq_team_member"),
    )


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    lead_id = Column(String(36), ForeignKey("leads.id", ondelete="SET NULL"), index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(30), default="active", nullable=False)
    budget_minutes = Column(Integer, default=0, nullable=False)
    budget_amount_cents = Column(Integer, default=0, nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)


class ProjectMember(Base, TimestampMixin):
    __tablename__ = "project_members"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="contributor", nullable=False)
    allocation_percent = Column(Integer, default=100, nullable=False)
    hours_per_week = Column(Integer, default=40, nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)

    __table_args__ = (
        UniqueConstraint("project_id", "person_id", name="uq_project_member"),
    )


class ProjectTask(Base, TimestampMixin):
    __tablename__ = "project_tasks"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    assignee_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), index=True)
    task_number = Column(Integer, default=1, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(30), default="todo", nullable=False, index=True)
    priority = Column(String(20), default="medium", nullable=False, index=True)
    estimate_minutes = Column(Integer, default=0, nullable=False)
    start_date = Column(Date)
    due_date = Column(Date)
    completed_at = Column(DateTime)
    needs_reassignment = Column(Boolean, default=False, nullable=False, index=True)


class TaskAssignee(Base, TimestampMixin):
    __tablename__ = "task_assignees"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(30), default="contributor", nullable=False)  # owner, contributor, reviewer
    assigned_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    assigned_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("task_id", "person_id", name="uq_task_assignee"),
    )


class TimeEntry(Base, TimestampMixin):
    __tablename__ = "time_entries"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("project_tasks.id", ondelete="SET NULL"), index=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    entry_date = Column(Date, nullable=False, index=True)
    minutes = Column(Integer, nullable=False)
    description = Column(Text, nullable=False)
    is_billable = Column(Boolean, default=True, nullable=False)
    approval_status = Column(String(30), default="pending", nullable=False, index=True)
    rejection_reason = Column(Text)
    approved_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    reviewed_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    approved_at = Column(DateTime)
    reviewed_at = Column(DateTime)
    rate_cents = Column(Integer, default=0, nullable=False)
    invoice_id = Column(String(36), index=True)


class LeaveType(Base, TimestampMixin):
    __tablename__ = "leave_types"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=False)
    default_days_per_year = Column(Integer, default=20, nullable=False)
    is_paid = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("org_id", "code", name="uq_leave_type_code_per_org"),
    )


class LeaveBalance(Base, TimestampMixin):
    __tablename__ = "leave_balances"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(String(36), ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    allocated_days = Column(Float, default=20.0, nullable=False)
    used_days = Column(Float, default=0.0, nullable=False)

    __table_args__ = (
        UniqueConstraint("person_id", "leave_type_id", "year", name="uq_leave_balance_person_type_year"),
    )


class LeaveRequest(Base, TimestampMixin):
    __tablename__ = "leave_requests"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(String(36), ForeignKey("leave_types.id", ondelete="SET NULL"), nullable=True, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    leave_type = Column(String(30), default="annual", nullable=False)
    is_half_day = Column(Boolean, default=False, nullable=False)
    half_day_period = Column(String(20), nullable=True)
    days_computed = Column(Float, default=0.0, nullable=False)
    working_days = Column(Integer, default=0, nullable=False)
    reason = Column(Text)
    status = Column(String(30), default="pending", nullable=False)
    reviewed_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    reviewed_at = Column(DateTime)
    decision_note = Column(Text)
