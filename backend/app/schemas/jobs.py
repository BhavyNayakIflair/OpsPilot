from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_id: str
    user_id: str | None
    job_type: str
    status: str
    progress: int
    message: str
    input: dict[str, Any]
    request_fingerprint: str
    idempotency_key: str | None
    result: Any | None = None
    result_ref_type: str | None
    result_ref_id: str | None
    error_code: str | None
    error_message: str | None
    subject_type: str | None
    subject_id: str | None
    subject_label: str | None
    workflow_run_id: str | None
    retry_of_job_id: str | None
    attempts: int
    max_attempts: int
    version: int
    queued_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    heartbeat_at: datetime | None
    acknowledged_at: datetime | None
    created_at: datetime
    updated_at: datetime


class JobSubmitResponse(BaseModel):
    job_id: str
    status: str
    message: str
    deduplicated: bool = False
