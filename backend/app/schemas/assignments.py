from datetime import date
from typing import Optional, List, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.operations import TaskAssigneeRead, TaskRead


class LeaveConflictDetail(BaseModel):
    has_conflict: bool
    conflict_type: Optional[Literal["APPROVED", "PENDING"]] = None
    code: Optional[Literal["LEAVE_CONFLICT", "LEAVE_PENDING_WARNING"]] = None
    leave_start: Optional[date] = None
    leave_end: Optional[date] = None
    reason: Optional[str] = None
    message: Optional[str] = None


class AssigneeSuggestionRead(BaseModel):
    person_id: str
    person_name: str
    person_email: Optional[str] = None
    person_title: Optional[str] = None
    is_project_member: bool
    is_same_team: bool
    load_percent: float
    open_tasks_count: int
    open_estimated_hours: float
    has_leave_conflict: bool
    conflict_code: Optional[str] = None
    conflict_message: Optional[str] = None
    is_recommended: bool


class PersonLoadRead(BaseModel):
    person_id: str
    person_name: str
    weekly_capacity_hours: float
    open_tasks_count: int
    total_estimated_hours: float
    approved_leave_hours: float
    net_capacity_hours: float
    load_percent: float
    is_overloaded: bool


class CapacitySummaryRead(BaseModel):
    window_start: date
    window_end: date
    total_capacity_hours: float
    total_allocated_hours: float
    average_load_percent: float
    overloaded_people_count: int
    people: List[PersonLoadRead]


class BulkAssignItem(BaseModel):
    task_id: str
    person_id: str
    role: Literal["owner", "contributor", "reviewer"] = "contributor"
    override_leave_conflict: bool = False


class BulkAssignRequest(BaseModel):
    assignments: List[BulkAssignItem] = Field(min_length=1)


class BulkAssignResult(BaseModel):
    assigned_count: int
    warnings: List[str] = []
    assignments: List[TaskAssigneeRead] = []
