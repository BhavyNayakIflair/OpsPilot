from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EmployeeCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    title: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    billing_rate_cents: int = Field(default=0, ge=0)
    cost_rate_cents: int = Field(default=0, ge=0)


class EmployeeRead(EmployeeCreate, ReadModel):
    id: str
    org_id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
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


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    assignee_id: Optional[str] = None
    description: Optional[str] = None
    status: str = "todo"
    estimate_minutes: int = Field(default=0, ge=0)


class TaskRead(TaskCreate, ReadModel):
    id: str
    org_id: str
    project_id: str
    created_at: datetime
    updated_at: datetime


class TimeEntryCreate(BaseModel):
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
    created_at: datetime
    updated_at: datetime


class LeaveCreate(BaseModel):
    employee_id: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveRead(LeaveCreate, ReadModel):
    id: str
    org_id: str
    status: str
    created_at: datetime
    updated_at: datetime
