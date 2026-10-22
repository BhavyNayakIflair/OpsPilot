"""Create durable background job records.

Revision ID: 20261022_background_jobs
Revises: 20261019_cross_module
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20261022_background_jobs"
down_revision = "20261019_cross_module"
branch_labels = None
depends_on = None

TABLE = "background_jobs"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE not in inspector.get_table_names():
        op.create_table(
            TABLE,
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("job_type", sa.String(60), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="queued"),
            sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("message", sa.String(255), nullable=False, server_default="Job queued"),
            sa.Column("input", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("request_fingerprint", sa.String(64), nullable=False),
            sa.Column("idempotency_key", sa.String(80)),
            sa.Column("result", sa.JSON()),
            sa.Column("result_ref_type", sa.String(60)),
            sa.Column("result_ref_id", sa.String(36)),
            sa.Column("error_code", sa.String(40)),
            sa.Column("error_message", sa.Text()),
            sa.Column("subject_type", sa.String(60)),
            sa.Column("subject_id", sa.String(36)),
            sa.Column("subject_label", sa.String(255)),
            sa.Column("workflow_run_id", sa.String(36), sa.ForeignKey("workflow_runs.id", ondelete="SET NULL")),
            sa.Column("retry_of_job_id", sa.String(36), sa.ForeignKey(f"{TABLE}.id", ondelete="SET NULL")),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="2"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("queued_at", sa.DateTime(timezone=True)),
            sa.Column("started_at", sa.DateTime(timezone=True)),
            sa.Column("finished_at", sa.DateTime(timezone=True)),
            sa.Column("heartbeat_at", sa.DateTime(timezone=True)),
            sa.Column("acknowledged_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    existing_indexes = {index["name"] for index in sa.inspect(bind).get_indexes(TABLE)}
    indexes = (
        ("ix_background_jobs_org_status", ["org_id", "status"], False, None),
        ("ix_background_jobs_org_user_created", ["org_id", "user_id", "created_at"], False, None),
        ("uq_background_jobs_org_idempotency", ["org_id", "idempotency_key"], True, "idempotency_key IS NOT NULL"),
        (
            "uq_background_jobs_active_fingerprint",
            ["org_id", "user_id", "job_type", "request_fingerprint"],
            True,
            "status IN ('queued', 'running', 'waiting_for_approval')",
        ),
    )
    for name, columns, unique, predicate in indexes:
        if name not in existing_indexes:
            kwargs = {"unique": unique}
            if predicate:
                kwargs["postgresql_where"] = sa.text(predicate)
                kwargs["sqlite_where"] = sa.text(predicate)
            op.create_index(name, TABLE, columns, **kwargs)


def downgrade():
    bind = op.get_bind()
    if TABLE not in sa.inspect(bind).get_table_names():
        return
    existing_indexes = {index["name"] for index in sa.inspect(bind).get_indexes(TABLE)}
    for name in (
        "uq_background_jobs_active_fingerprint",
        "uq_background_jobs_org_idempotency",
        "ix_background_jobs_org_user_created",
        "ix_background_jobs_org_status",
    ):
        if name in existing_indexes:
            op.drop_index(name, table_name=TABLE)
    op.drop_table(TABLE)
