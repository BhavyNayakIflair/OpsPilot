from datetime import date, datetime
from typing import Literal, Optional, List
from pydantic import BaseModel, ConfigDict, Field


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


TaskStatus = Literal["todo", "in_progress", "in_review", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
AssigneeRole = Literal["owner", "contributor", "reviewer"]


class EmployeeCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    full_name: str = Field(min_length=1, max_length=255)
    title: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    employment_status: str = Field(default="full_time")
    billing_rate_cents: int = Field(default=0, ge=0)
    cost_rate_cents: int = Field(default=0, ge=0)
    weekly_capacity_minutes: int = Field(default=2400, ge=0)
    annual_leave_days: int = Field(default=20, ge=0)


class EmployeeRead(EmployeeCreate, ReadModel):
    id: str
    org_id: str
    is_active: bool
    weekly_capacity_hours: float = 40.0
    created_at: datetime
    updated_at: datetime


class EmployeeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    title: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    employment_status: Optional[str] = None
    billing_rate_cents: Optional[int] = Field(default=None, ge=0)
    cost_rate_cents: Optional[int] = Field(default=None, ge=0)
    weekly_capacity_minutes: Optional[int] = Field(default=None, ge=0)
    annual_leave_days: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class TeamMemberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    person_id: str
    role: str = "member"


class TeamMemberRead(ReadModel):
    id: str
    org_id: str
    team_id: str
    person_id: str
    role: str
    person_name: Optional[str] = None
    person_email: Optional[str] = None
    person_title: Optional[str] = None
    is_on_leave_today: bool = False
    is_on_leave_this_week: bool = False
    created_at: datetime
    updated_at: datetime


class TeamCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    lead_id: Optional[str] = None
    is_active: bool = True


class TeamUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    lead_id: Optional[str] = None
    is_active: Optional[bool] = None


class TeamRead(TeamCreate, ReadModel):
    id: str
    org_id: str
    member_count: int = 0
    lead_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TeamDetailRead(TeamRead):
    members: List[TeamMemberRead] = []
    active_projects_count: int = 0


class ProjectMemberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    person_id: str
    role: str = "contributor"
    allocation_percent: int = Field(default=100, ge=1, le=200)
    hours_per_week: int = Field(default=40, ge=1, le=80)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectMemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Optional[str] = None
    allocation_percent: Optional[int] = Field(default=None, ge=1, le=200)
    hours_per_week: Optional[int] = Field(default=None, ge=1, le=80)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectMemberRead(ProjectMemberCreate, ReadModel):
    id: str
    org_id: str
    project_id: str
    person_name: Optional[str] = None
    person_email: Optional[str] = None
    person_title: Optional[str] = None
    created_at: datetime
    updated_at: datetime


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
    members_count: int = 0
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


class TaskAssigneeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    person_id: str
    role: AssigneeRole = "contributor"
    override_leave_conflict: bool = False


class TaskAssigneeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: AssigneeRole


class TaskAssigneeRead(ReadModel):
    id: str
    org_id: str
    task_id: str
    person_id: str
    role: str
    person_name: Optional[str] = None
    person_email: Optional[str] = None
    assigned_by: Optional[str] = None
    assigned_at: datetime
    created_at: datetime
    updated_at: datetime


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
    needs_reassignment: Optional[bool] = None


class TaskRead(TaskCreate, ReadModel):
    id: str
    org_id: str
    project_id: str
    task_number: int
    needs_reassignment: bool = False
    assignees: List[TaskAssigneeRead] = []
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


class LeaveTypeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    default_days_per_year: int = Field(default=20, ge=0)
    is_paid: bool = True
    is_active: bool = True


class LeaveTypeRead(LeaveTypeCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class LeaveBalanceRead(ReadModel):
    id: str
    org_id: str
    person_id: str
    leave_type_id: str
    leave_type_name: Optional[str] = None
    leave_type_code: Optional[str] = None
    year: int
    allocated_days: float
    used_days: float
    remaining_days: float = 0.0
    created_at: datetime
    updated_at: datetime


class LeaveCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: str
    leave_type_id: Optional[str] = None
    start_date: date
    end_date: date
    leave_type: str = "annual"
    is_half_day: bool = False
    half_day_period: Optional[str] = None
    working_days: int = Field(default=0, ge=0)
    reason: Optional[str] = None


class LeaveRead(LeaveCreate, ReadModel):
    id: str
    org_id: str
    status: str
    days_computed: float = 0.0
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeaveUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    leave_type_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    leave_type: Optional[str] = None
    is_half_day: Optional[bool] = None
    half_day_period: Optional[str] = None
    working_days: Optional[int] = Field(default=None, ge=0)
    reason: Optional[str] = None


class LeaveDecisionRequest(BaseModel):
    decision: Literal["approved", "rejected", "cancelled"]
    decision_note: Optional[str] = None


class LeaveCalendarEventRead(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    leave_type: str
    start_date: date
    end_date: date
    days: float
    is_half_day: bool
    status: str


class PersonDetailRead(EmployeeRead):
    teams: List[TeamRead] = []
    project_allocations: List[ProjectMemberRead] = []
    assigned_tasks: List[TaskRead] = []
    leave_balances: List[LeaveBalanceRead] = []
    upcoming_leave: List[LeaveRead] = []
    current_load_percent: float = 0.0
