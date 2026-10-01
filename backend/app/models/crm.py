from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, Text
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Company(Base, TimestampMixin):
    __tablename__ = "companies"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    website = Column(String(500))
    industry = Column(String(120))
    notes = Column(Text)


class Contact(Base, TimestampMixin):
    __tablename__ = "contacts"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(String(36), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    email = Column(String(255), index=True)
    phone = Column(String(80))
    title = Column(String(120))


class PipelineStage(Base, TimestampMixin):
    __tablename__ = "pipeline_stages"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    probability = Column(Integer, nullable=False, default=0)
    is_won = Column(Boolean, nullable=False, default=False)
    is_lost = Column(Boolean, nullable=False, default=False)


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(String(36), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    contact_id = Column(String(36), ForeignKey("contacts.id", ondelete="SET NULL"), index=True)
    stage_id = Column(String(36), ForeignKey("pipeline_stages.id", ondelete="SET NULL"), index=True)
    title = Column(String(255), nullable=False)
    source = Column(String(100), default="manual", nullable=False)
    status = Column(String(30), default="open", nullable=False)
    value_cents = Column(Integer, default=0, nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    notes = Column(Text)


class Activity(Base, TimestampMixin):
    __tablename__ = "activities"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    lead_id = Column(String(36), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    kind = Column(String(40), default="note", nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text)
