"""Add the default rate to existing rate cards."""
import sqlalchemy as sa
from alembic import op

revision = "20260929_rate_card_rate"
down_revision = "20260929_crm_quotes"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("rate_cards")}
    if "default_rate_cents" not in columns:
        op.add_column(
            "rate_cards",
            sa.Column("default_rate_cents", sa.Integer(), nullable=False, server_default="0"),
        )
        op.alter_column("rate_cards", "default_rate_cents", server_default=None)


def downgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("rate_cards")}
    if "default_rate_cents" in columns:
        op.drop_column("rate_cards", "default_rate_cents")
