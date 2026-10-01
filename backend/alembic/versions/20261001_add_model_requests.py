"""Add tenant-scoped model request telemetry."""
import sqlalchemy as sa
from alembic import op

revision = "20261001_model_requests"
down_revision = "20260929_rate_card_rate"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if "model_requests" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "model_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("task_type", sa.String(length=80), nullable=False, server_default="general"),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("org_id", sa.String(length=36), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_model_requests_org_id", "model_requests", ["org_id"])


def downgrade():
    bind = op.get_bind()
    if "model_requests" not in sa.inspect(bind).get_table_names():
        return
    op.drop_index("ix_model_requests_org_id", table_name="model_requests")
    op.drop_table("model_requests")
