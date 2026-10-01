from sqlalchemy import Column, String, Boolean, Integer, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    plan = Column(String(50), default="Team", nullable=False)  # Free, Team, Business
    is_active = Column(Boolean, default=True, nullable=False)
    monthly_spend_cap_cents = Column(Integer, default=5000, nullable=False)  # $50.00
    ai_spend_cents = Column(Integer, default=0, nullable=False)
    
    # Configuration like approval thresholds, timezone, date format
    settings = Column(JSON, default=dict, nullable=False)

    # Relationships
    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="organization", uselist=False, cascade="all, delete-orphan")
