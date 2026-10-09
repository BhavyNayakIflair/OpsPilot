"""Add delivery foundation fields and indexes for tasks, timesheets, and leave."""

import sqlalchemy as sa
from alembic import op

revision = "20261007_delivery_foundations"
down_revision = "20261006_chunk_meta"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    employee_columns = {col["name"] for col in sa.inspect(bind).get_columns("employees")}
    if "weekly_capacity_minutes" not in employee_columns:
        op.add_column("employees", sa.Column("weekly_capacity_minutes", sa.Integer(), nullable=False, server_default="2400"))
    if "annual_leave_days" not in employee_columns:
        op.add_column("employees", sa.Column("annual_leave_days", sa.Integer(), nullable=False, server_default="20"))

    task_columns = {col["name"] for col in sa.inspect(bind).get_columns("project_tasks")}
    if "task_number" not in task_columns:
        op.add_column("project_tasks", sa.Column("task_number", sa.Integer(), nullable=False, server_default="1"))
    if "priority" not in task_columns:
        op.add_column("project_tasks", sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"))
    if "start_date" not in task_columns:
        op.add_column("project_tasks", sa.Column("start_date", sa.Date(), nullable=True))
    if "due_date" not in task_columns:
        op.add_column("project_tasks", sa.Column("due_date", sa.Date(), nullable=True))
    if "completed_at" not in task_columns:
        op.add_column("project_tasks", sa.Column("completed_at", sa.DateTime(), nullable=True))

    time_columns = {col["name"] for col in sa.inspect(bind).get_columns("time_entries")}
    for column_name in [
        "rejection_reason",
        "approved_by_user_id",
        "reviewed_by_user_id",
        "approved_at",
        "reviewed_at",
        "rate_cents",
    ]:
        if column_name not in time_columns:
            column_type = sa.Text() if column_name == "rejection_reason" else sa.String(length=36)
            if column_name in {"approved_at", "reviewed_at"}:
                column_type = sa.DateTime()
            if column_name == "rate_cents":
                column_type = sa.Integer()
            op.add_column("time_entries", sa.Column(column_name, column_type, nullable=True))
    if "invoice_id" not in time_columns:
        op.add_column("time_entries", sa.Column("invoice_id", sa.String(length=36), nullable=True))

    leave_columns = {col["name"] for col in sa.inspect(bind).get_columns("leave_requests")}
    if "leave_type" not in leave_columns:
        op.add_column("leave_requests", sa.Column("leave_type", sa.String(length=30), nullable=False, server_default="annual"))
    if "working_days" not in leave_columns:
        op.add_column("leave_requests", sa.Column("working_days", sa.Integer(), nullable=False, server_default="0"))
    if "reviewed_by_user_id" not in leave_columns:
        op.add_column("leave_requests", sa.Column("reviewed_by_user_id", sa.String(length=36), nullable=True))
    if "reviewed_at" not in leave_columns:
        op.add_column("leave_requests", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    if "decision_note" not in leave_columns:
        op.add_column("leave_requests", sa.Column("decision_note", sa.Text(), nullable=True))

    op.create_index(op.f("ix_project_tasks_task_number"), "project_tasks", ["task_number"], unique=False)
    op.create_index(op.f("ix_project_tasks_priority"), "project_tasks", ["priority"], unique=False)
    op.create_index(op.f("ix_time_entries_approval_status"), "time_entries", ["approval_status"], unique=False)
    op.create_index(op.f("ix_time_entries_approved_by_user_id"), "time_entries", ["approved_by_user_id"], unique=False)
    op.create_index(op.f("ix_time_entries_reviewed_by_user_id"), "time_entries", ["reviewed_by_user_id"], unique=False)
    op.create_index(op.f("ix_leave_requests_reviewed_by_user_id"), "leave_requests", ["reviewed_by_user_id"], unique=False)


def downgrade():
    bind = op.get_bind()

    leave_columns = {col["name"] for col in sa.inspect(bind).get_columns("leave_requests")}
    for column in ["decision_note", "reviewed_at", "reviewed_by_user_id", "working_days", "leave_type"]:
        if column in leave_columns:
            op.drop_column("leave_requests", column)

    time_columns = {col["name"] for col in sa.inspect(bind).get_columns("time_entries")}
    for column in ["invoice_id", "rate_cents", "reviewed_at", "approved_at", "reviewed_by_user_id", "approved_by_user_id", "rejection_reason"]:
        if column in time_columns:
            op.drop_column("time_entries", column)

    task_columns = {col["name"] for col in sa.inspect(bind).get_columns("project_tasks")}
    for column in ["completed_at", "due_date", "start_date", "priority", "task_number"]:
        if column in task_columns:
            op.drop_column("project_tasks", column)

    employee_columns = {col["name"] for col in sa.inspect(bind).get_columns("employees")}
    for column in ["annual_leave_days", "weekly_capacity_minutes"]:
        if column in employee_columns:
            op.drop_column("employees", column)
