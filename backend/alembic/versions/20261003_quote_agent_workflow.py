"""Persist quote-agent node steps and human-review approvals."""
import sqlalchemy as sa
from alembic import op

revision = "20261003_quote_agent"
down_revision = "20261002_document_chunks"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "workflow_steps" not in tables:
        op.create_table(
            "workflow_steps",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("org_id", sa.String(length=36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workflow_run_id", sa.String(length=36), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("node_name", sa.String(length=80), nullable=False),
            sa.Column("model", sa.String(length=120), nullable=False, server_default="none"),
            sa.Column("latency_ms", sa.Float(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("result_summary", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_workflow_steps_org_id", "workflow_steps", ["org_id"])
        op.create_index("ix_workflow_steps_run_id", "workflow_steps", ["workflow_run_id"])

    if "quote_agent_approvals" not in tables:
        op.create_table(
            "quote_agent_approvals",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("org_id", sa.String(length=36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workflow_run_id", sa.String(length=36), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_quote_agent_approvals_org_id", "quote_agent_approvals", ["org_id"])
        op.create_index("ix_quote_agent_approvals_org_status", "quote_agent_approvals", ["org_id", "status"])


def downgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "quote_agent_approvals" in tables:
        op.drop_table("quote_agent_approvals")
    if "workflow_steps" in tables:
        op.drop_table("workflow_steps")
