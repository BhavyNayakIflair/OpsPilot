from sqlalchemy import Column, String, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid, TenantMixin


class Subscription(Base, TimestampMixin, TenantMixin):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    plan = Column(String(50), default="Team", nullable=False)  # Free, Team, Business
    status = Column(String(50), default="active", nullable=False)  # active, past_due, canceled
    monthly_price_cents = Column(Integer, default=4900, nullable=False)  # $49/mo
    billing_cycle = Column(String(20), default="monthly", nullable=False)
    stripe_customer_id = Column(String(100), nullable=True)
    stripe_subscription_id = Column(String(100), nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="subscription")


class UsageCounter(Base, TimestampMixin, TenantMixin):
    __tablename__ = "usage_counters"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM
    ai_tokens_used = Column(Integer, default=0, nullable=False)
    ai_cost_cents = Column(Integer, default=0, nullable=False)
    invoices_created = Column(Integer, default=0, nullable=False)
    storage_bytes_used = Column(Integer, default=0, nullable=False)
    extra_metrics = Column(JSON, default=dict, nullable=False)
