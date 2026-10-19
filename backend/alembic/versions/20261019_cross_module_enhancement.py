"""Cross-module enhancement: Teams, Project Allocations, Task Assignees, Leave Types/Balances, Invoice Sequences.

Revision ID: 20261019_cross_module
Revises: 20261008_timesheet_rate_not_null
Create Date: 2026-10-19
"""

import uuid
import sqlalchemy as sa
from alembic import op

revision = "20261019_cross_module"
down_revision = "20261008_timesheet_rate_not_null"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # 1. Enhance employees
    emp_cols = {col["name"] for col in inspector.get_columns("employees")}
    if "employment_status" not in emp_cols:
        op.add_column("employees", sa.Column("employment_status", sa.String(50), nullable=False, server_default="full_time"))
    if "role" not in emp_cols:
        op.add_column("employees", sa.Column("role", sa.String(100), nullable=True))

    # 2. Enhance project_tasks
    task_cols = {col["name"] for col in inspector.get_columns("project_tasks")}
    if "needs_reassignment" not in task_cols:
        op.add_column("project_tasks", sa.Column("needs_reassignment", sa.Boolean(), nullable=False, server_default="false"))
        op.create_index(op.f("ix_project_tasks_needs_reassignment"), "project_tasks", ["needs_reassignment"], unique=False)

    # 3. Enhance invoices
    inv_cols = {col["name"] for col in inspector.get_columns("invoices")}
    if "discount_cents" not in inv_cols:
        op.add_column("invoices", sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"))

    # 4. Create teams table
    if "teams" not in existing_tables:
        op.create_table(
            "teams",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("lead_id", sa.String(36), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    # 5. Create team_members table
    if "team_members" not in existing_tables:
        op.create_table(
            "team_members",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("team_id", sa.String(36), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("person_id", sa.String(36), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role", sa.String(50), nullable=False, server_default="member"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("team_id", "person_id", name="uq_team_member"),
        )
        op.create_index("ix_team_members_org_person", "team_members", ["org_id", "person_id"], unique=False)

    # 6. Create project_members table
    if "project_members" not in existing_tables:
        op.create_table(
            "project_members",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("person_id", sa.String(36), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role", sa.String(50), nullable=False, server_default="contributor"),
            sa.Column("allocation_percent", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("hours_per_week", sa.Integer(), nullable=False, server_default="40"),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("project_id", "person_id", name="uq_project_member"),
        )
        op.create_index("ix_project_members_org_person", "project_members", ["org_id", "person_id"], unique=False)
        op.create_index("ix_project_members_person_dates", "project_members", ["person_id", "start_date", "end_date"], unique=False)

    # 7. Create task_assignees table
    if "task_assignees" not in existing_tables:
        op.create_table(
            "task_assignees",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("task_id", sa.String(36), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("person_id", sa.String(36), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role", sa.String(30), nullable=False, server_default="contributor"),
            sa.Column("assigned_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("task_id", "person_id", name="uq_task_assignee"),
        )
        op.create_index("ix_task_assignees_org_person", "task_assignees", ["org_id", "person_id"], unique=False)

    # 8. Create leave_types table
    if "leave_types" not in existing_tables:
        op.create_table(
            "leave_types",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("default_days_per_year", sa.Integer(), nullable=False, server_default="20"),
            sa.Column("is_paid", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("org_id", "code", name="uq_leave_type_code_per_org"),
        )

    # 9. Create leave_balances table
    if "leave_balances" not in existing_tables:
        op.create_table(
            "leave_balances",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("person_id", sa.String(36), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("leave_type_id", sa.String(36), sa.ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("year", sa.Integer(), nullable=False, index=True),
            sa.Column("allocated_days", sa.Float(), nullable=False, server_default="20"),
            sa.Column("used_days", sa.Float(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("person_id", "leave_type_id", "year", name="uq_leave_balance_person_type_year"),
        )
        op.create_index("ix_leave_balances_org_person", "leave_balances", ["org_id", "person_id"], unique=False)

    # 10. Enhance leave_requests table
    leave_cols = {col["name"] for col in inspector.get_columns("leave_requests")}
    if "leave_type_id" not in leave_cols:
        op.add_column("leave_requests", sa.Column("leave_type_id", sa.String(36), sa.ForeignKey("leave_types.id", ondelete="SET NULL"), nullable=True))
        op.create_index(op.f("ix_leave_requests_leave_type_id"), "leave_requests", ["leave_type_id"], unique=False)
    if "is_half_day" not in leave_cols:
        op.add_column("leave_requests", sa.Column("is_half_day", sa.Boolean(), nullable=False, server_default="false"))
    if "half_day_period" not in leave_cols:
        op.add_column("leave_requests", sa.Column("half_day_period", sa.String(20), nullable=True))
    if "days_computed" not in leave_cols:
        op.add_column("leave_requests", sa.Column("days_computed", sa.Float(), nullable=False, server_default="0"))

    # Add index on (employee_id, start_date, end_date) on leave_requests
    leave_indexes = {ix["name"] for ix in inspector.get_indexes("leave_requests")}
    if "ix_leave_requests_person_dates" not in leave_indexes:
        op.create_index("ix_leave_requests_person_dates", "leave_requests", ["employee_id", "start_date", "end_date"], unique=False)

    # 11. Create invoice_sequences table
    if "invoice_sequences" not in existing_tables:
        op.create_table(
            "invoice_sequences",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("year", sa.Integer(), nullable=False, index=True),
            sa.Column("prefix", sa.String(20), nullable=False, server_default="INV"),
            sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("org_id", "year", "prefix", name="uq_invoice_seq_org_year_prefix"),
        )

    # 12. Backfill task_assignees from existing project_tasks.assignee_id
    tasks_with_assignees = bind.execute(
        sa.text("SELECT id, org_id, assignee_id, created_at FROM project_tasks WHERE assignee_id IS NOT NULL")
    ).fetchall()
    for task in tasks_with_assignees:
        bind.execute(
            sa.text(
                "INSERT INTO task_assignees (id, org_id, task_id, person_id, role, assigned_at, created_at, updated_at) "
                "VALUES (:id, :org_id, :task_id, :person_id, 'owner', :created_at, :created_at, :created_at) "
                "ON CONFLICT DO NOTHING"
            ),
            {
                "id": str(uuid.uuid4()),
                "org_id": task[1],
                "task_id": task[0],
                "person_id": task[2],
                "created_at": task[3],
            },
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Drop tables in reverse order
    if "invoice_sequences" in existing_tables:
        op.drop_table("invoice_sequences")

    if "leave_requests" in existing_tables:
        leave_indexes = {ix["name"] for ix in inspector.get_indexes("leave_requests")}
        if "ix_leave_requests_person_dates" in leave_indexes:
            op.drop_index("ix_leave_requests_person_dates", table_name="leave_requests")
        leave_cols = {col["name"] for col in inspector.get_columns("leave_requests")}
        for col in ["days_computed", "half_day_period", "is_half_day", "leave_type_id"]:
            if col in leave_cols:
                op.drop_column("leave_requests", col)

    if "leave_balances" in existing_tables:
        op.drop_table("leave_balances")

    if "leave_types" in existing_tables:
        op.drop_table("leave_types")

    if "task_assignees" in existing_tables:
        op.drop_table("task_assignees")

    if "project_members" in existing_tables:
        op.drop_table("project_members")

    if "team_members" in existing_tables:
        op.drop_table("team_members")

    if "teams" in existing_tables:
        op.drop_table("teams")

    if "invoices" in existing_tables:
        inv_cols = {col["name"] for col in inspector.get_columns("invoices")}
        if "discount_cents" in inv_cols:
            op.drop_column("invoices", "discount_cents")

    if "project_tasks" in existing_tables:
        task_cols = {col["name"] for col in inspector.get_columns("project_tasks")}
        if "needs_reassignment" in task_cols:
            op.drop_column("project_tasks", "needs_reassignment")

    if "employees" in existing_tables:
        emp_cols = {col["name"] for col in inspector.get_columns("employees")}
        if "role" in emp_cols:
            op.drop_column("employees", "role")
        if "employment_status" in emp_cols:
            op.drop_column("employees", "employment_status")
