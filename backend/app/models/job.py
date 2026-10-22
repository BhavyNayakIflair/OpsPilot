from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    text,
)

from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class BackgroundJob(Base, TimestampMixin):
    __tablename__ = "background_jobs"
    __table_args__ = (
        Index("ix_background_jobs_org_status", "org_id", "status"),
        Index("ix_background_jobs_org_user_created", "org_id", "user_id", "created_at"),
        Index(
            "uq_background_jobs_org_idempotency",
            "org_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
            sqlite_where=text("idempotency_key IS NOT NULL"),
        ),
        Index(
            "uq_background_jobs_active_fingerprint",
            "org_id",
            "user_id",
            "job_type",
            "request_fingerprint",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running', 'waiting_for_approval')"),
            sqlite_where=text("status IN ('queued', 'running', 'waiting_for_approval')"),
        ),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    job_type = Column(String(60), nullable=False)
    status = Column(String(30), nullable=False, default="queued")
    progress = Column(Integer, nullable=False, default=0)
    message = Column(String(255), nullable=False, default="Job queued")
    input = Column(JSON, nullable=False, default=dict)
    request_fingerprint = Column(String(64), nullable=False)
    idempotency_key = Column(String(80))
    result = Column(JSON)
    result_ref_type = Column(String(60))
    result_ref_id = Column(String(36))
    error_code = Column(String(40))
    error_message = Column(Text)
    subject_type = Column(String(60))
    subject_id = Column(String(36))
    subject_label = Column(String(255))
    workflow_run_id = Column(String(36), ForeignKey("workflow_runs.id", ondelete="SET NULL"))
    retry_of_job_id = Column(String(36), ForeignKey("background_jobs.id", ondelete="SET NULL"))
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=2)
    version = Column(Integer, nullable=False, default=1)
    queued_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    heartbeat_at = Column(DateTime(timezone=True))
    acknowledged_at = Column(DateTime(timezone=True))
