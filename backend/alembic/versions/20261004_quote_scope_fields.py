"""Persist quote descriptions."""
import sqlalchemy as sa
from alembic import op

revision = "20261004_quote_scope"
down_revision = "20261003_quote_agent"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("quotes")}
    if "description" not in columns:
        op.add_column("quotes", sa.Column("description", sa.Text(), nullable=True))


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("quotes")}
    if "description" in columns:
        op.drop_column("quotes", "description")
