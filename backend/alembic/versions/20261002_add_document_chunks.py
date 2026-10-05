"""Add tenant-scoped document chunks and pgvector cosine index."""
import sqlalchemy as sa
from alembic import op

revision = "20261002_document_chunks"
down_revision = "20261001_model_requests"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    is_postgres = bind.dialect.name == "postgresql"

    # pgvector is optional — skip gracefully if the extension is not installed.
    vector_available = False
    if is_postgres:
        try:
            bind.execute(sa.text("SAVEPOINT pgvector_check"))
            op.execute("CREATE EXTENSION IF NOT EXISTS vector")
            bind.execute(sa.text("RELEASE SAVEPOINT pgvector_check"))
            vector_available = True
        except Exception:
            bind.execute(sa.text("ROLLBACK TO SAVEPOINT pgvector_check"))

    if "document_chunks" not in tables:
        op.create_table(
            "document_chunks",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("document_id", sa.String(length=36), sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("org_id", sa.String(length=36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("embedding", sa.Text(), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
        op.create_index("ix_document_chunks_org_id", "document_chunks", ["org_id"])
        op.create_index("ix_document_chunks_org_document", "document_chunks", ["org_id", "document_id"])

    if is_postgres and vector_available:
        embedding_type = next(column["type"] for column in sa.inspect(bind).get_columns("document_chunks") if column["name"] == "embedding")
        if "vector" not in str(embedding_type).lower():
            op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade():
    bind = op.get_bind()
    if "document_chunks" not in sa.inspect(bind).get_table_names():
        return
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
    op.drop_table("document_chunks")
