"""Add embedding_model and embedding_dimension to document_chunks."""
import sqlalchemy as sa
from alembic import op

revision = "20261006_chunk_meta"
down_revision = "20261005_user_locale"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("document_chunks")}
    if "embedding_model" not in columns:
        op.add_column(
            "document_chunks",
            sa.Column(
                "embedding_model",
                sa.String(length=100),
                nullable=True,
                server_default="gemini-embedding-001",
            ),
        )
    if "embedding_dimension" not in columns:
        op.add_column(
            "document_chunks",
            sa.Column(
                "embedding_dimension",
                sa.Integer(),
                nullable=True,
                server_default="768",
            ),
        )


def downgrade():
    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("document_chunks")}
    if "embedding_dimension" in columns:
        op.drop_column("document_chunks", "embedding_dimension")
    if "embedding_model" in columns:
        op.drop_column("document_chunks", "embedding_model")
