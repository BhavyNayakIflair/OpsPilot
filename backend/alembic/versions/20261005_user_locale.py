"""Add per-user interface language preference."""
import sqlalchemy as sa
from alembic import op

revision = "20261005_user_locale"
down_revision = "20261004_quote_scope"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "locale" not in columns:
        op.add_column(
            "users",
            sa.Column("locale", sa.String(length=5), nullable=False, server_default="en"),
        )


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "locale" in columns:
        op.drop_column("users", "locale")
