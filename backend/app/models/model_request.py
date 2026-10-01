from sqlalchemy import Column, Float, ForeignKey, Integer, String

from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class ModelRequest(Base, TimestampMixin):
    __tablename__ = "model_requests"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    provider = Column(String(40), nullable=False)
    model = Column(String(120), nullable=False)
    task_type = Column(String(80), nullable=False, default="general")
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    latency_ms = Column(Float, nullable=False)
    cost_usd = Column(Float, nullable=False, default=0)
    status = Column(String(30), nullable=False)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
