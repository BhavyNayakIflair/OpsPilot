"""Backfill timesheet rates added as nullable during delivery foundations."""

import sqlalchemy as sa
from alembic import op

revision = "20261008_timesheet_rate_not_null"
down_revision = "20261007_delivery_foundations"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"]: column for column in sa.inspect(bind).get_columns("time_entries")}
    if "rate_cents" not in columns:
        op.add_column(
            "time_entries",
            sa.Column("rate_cents", sa.Integer(), nullable=False, server_default="0"),
        )
        op.alter_column("time_entries", "rate_cents", server_default=None)
        return

    op.execute(sa.text("UPDATE time_entries SET rate_cents = 0 WHERE rate_cents IS NULL"))
    if columns["rate_cents"]["nullable"]:
        with op.batch_alter_table("time_entries") as batch_op:
            batch_op.alter_column(
                "rate_cents",
                existing_type=sa.Integer(),
                nullable=False,
                server_default="0",
            )
        op.alter_column("time_entries", "rate_cents", server_default=None)


def downgrade():
    bind = op.get_bind()
    columns = {column["name"]: column for column in sa.inspect(bind).get_columns("time_entries")}
    if "rate_cents" in columns and not columns["rate_cents"]["nullable"]:
        with op.batch_alter_table("time_entries") as batch_op:
            batch_op.alter_column(
                "rate_cents",
                existing_type=sa.Integer(),
                nullable=True,
            )
