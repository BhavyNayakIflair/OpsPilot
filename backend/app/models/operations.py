from sqlalchemy import Column, String, Integer, Boolean, Date, ForeignKey, Text
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Employee(Base, TimestampMixin):
    __tablename__ = "employees"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    full_name = Column(String(255), nullable=False)
    title = Column(String(120))
    email = Column(String(255))
    billing_rate_cents = Column(Integer, default=0, nullable=False)
    cost_rate_cents = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


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


class ProjectTask(Base, TimestampMixin):
    __tablename__ = "project_tasks"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    assignee_id = Column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(30), default="todo", nullable=False)
    estimate_minutes = Column(Integer, default=0, nullable=False)


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
    approval_status = Column(String(30), default="pending", nullable=False)


class LeaveRequest(Base, TimestampMixin):
    __tablename__ = "leave_requests"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text)
    status = Column(String(30), default="pending", nullable=False)
