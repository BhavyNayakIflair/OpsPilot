import json

from sqlalchemy import Column, String, ForeignKey, Text, JSON, Index, Integer
from sqlalchemy.types import TypeDecorator
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class MigrationJob(Base, TimestampMixin):
    __tablename__ = "migration_jobs"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    filename = Column(String(255), nullable=False)
    target = Column(String(40), nullable=False)
    status = Column(String(30), default="dry_run", nullable=False)
    rows = Column(JSON, default=list, nullable=False)
    errors = Column(JSON, default=list, nullable=False)


class KnowledgeDocument(Base, TimestampMixin):
    __tablename__ = "knowledge_documents"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    title = Column(String(255), nullable=False)
    category = Column(String(80), default="general", nullable=False)
    content = Column(Text, nullable=False)


class VectorEmbedding(TypeDecorator):
    """Store vectors as JSON in metadata-created/test schemas; migrations promote PG to vector(768)."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if len(value) != 768:
            raise ValueError(f"Expected a 768-dimensional embedding, got {len(value)}")
        return json.dumps(value, separators=(",", ":"))

    def process_result_value(self, value, dialect):
        return json.loads(value) if isinstance(value, str) else value


class DocumentChunk(Base, TimestampMixin):
    __tablename__ = "document_chunks"
    __table_args__ = (Index("ix_document_chunks_org_document", "org_id", "document_id"),)

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    embedding = Column(VectorEmbedding(), nullable=False)
    chunk_index = Column(Integer, nullable=False)


class WorkflowRun(Base, TimestampMixin):
    __tablename__ = "workflow_runs"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    workflow_type = Column(String(60), nullable=False)
    status = Column(String(30), default="completed", nullable=False)
    input_data = Column(JSON, default=dict, nullable=False)
    result_data = Column(JSON, default=dict, nullable=False)
