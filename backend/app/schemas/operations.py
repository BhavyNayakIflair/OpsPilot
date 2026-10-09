from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


TaskStatus = Literal["todo", "in_progress", "in_review", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]


class EmployeeCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    full_name: str = Field(min_length=1, max_length=255)
    title: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    billing_rate_cents: int = Field(default=0, ge=0)
    cost_rate_cents: int = Field(default=0, ge=0)
    weekly_capacity_minutes: int = Field(default=2400, ge=0)
    annual_leave_days: int = Field(default=20, ge=0)


class EmployeeRead(EmployeeCreate, ReadModel):
    id: str
    org_id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class EmployeeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    title: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    billing_rate_cents: Optional[int] = Field(default=None, ge=0)
    cost_rate_cents: Optional[int] = Field(default=None, ge=0)
    weekly_capacity_minutes: Optional[int] = Field(default=None, ge=0)
    annual_leave_days: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    lead_id: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"
    budget_minutes: int = Field(default=0, ge=0)
    budget_amount_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectRead(ProjectCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    lead_id: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    budget_minutes: Optional[int] = Field(default=None, ge=0)
    budget_amount_cents: Optional[int] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    assignee_id: Optional[str] = None
    description: Optional[str] = None
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    estimate_minutes: int = Field(default=0, ge=0)
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    assignee_id: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    estimate_minutes: Optional[int] = Field(default=None, ge=0)
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class TaskRead(TaskCreate, ReadModel):
    id: str
    org_id: str
    project_id: str
    task_number: int
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class TimeEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str
    task_id: Optional[str] = None
    employee_id: Optional[str] = None
    entry_date: date
    minutes: int = Field(gt=0, le=1440)
    description: str = Field(min_length=1)
    is_billable: bool = True


class TimeEntryRead(TimeEntryCreate, ReadModel):
    id: str
    org_id: str
    user_id: Optional[str]
    approval_status: str
    rejection_reason: Optional[str] = None
    approved_by_user_id: Optional[str] = None
    reviewed_by_user_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    rate_cents: int = 0
    invoice_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TimeEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: Optional[str] = None
    task_id: Optional[str] = None
    entry_date: Optional[date] = None
    minutes: Optional[int] = Field(default=None, gt=0, le=1440)
    description: Optional[str] = Field(default=None, min_length=1)
    is_billable: Optional[bool] = None


class LeaveCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: str
    start_date: date
    end_date: date
    leave_type: str = "annual"
    working_days: int = Field(default=0, ge=0)
    reason: Optional[str] = None


class LeaveRead(LeaveCreate, ReadModel):
    id: str
    org_id: str
    status: str
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeaveUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: Optional[date] = None
    end_date: Optional[date] = None
    leave_type: Optional[str] = None
    working_days: Optional[int] = Field(default=None, ge=0)
    reason: Optional[str] = None
