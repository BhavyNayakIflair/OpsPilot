from sqlalchemy import Column, String, Integer, ForeignKey, Text, DateTime
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class RateCard(Base, TimestampMixin):
    __tablename__ = "rate_cards"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    default_rate_cents = Column(Integer, default=0, nullable=False)
    description = Column(Text)


class Quote(Base, TimestampMixin):
    __tablename__ = "quotes"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    rate_card_id = Column(String(36), ForeignKey("rate_cards.id", ondelete="SET NULL"), index=True)
    lead_id = Column(String(36), ForeignKey("leads.id", ondelete="SET NULL"), index=True)
    title = Column(String(255), nullable=False)
    status = Column(String(30), default="draft", nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    discount_bps = Column(Integer, default=0, nullable=False)
    tax_bps = Column(Integer, default=0, nullable=False)
    subtotal_cents = Column(Integer, default=0, nullable=False)
    total_cents = Column(Integer, default=0, nullable=False)
    accept_token = Column(String(36), unique=True, nullable=False, default=generate_uuid, index=True)
    accepted_at = Column(DateTime(timezone=True))
    terms = Column(Text)


class QuoteLineItem(Base, TimestampMixin):
    __tablename__ = "quote_line_items"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    quote_id = Column(String(36), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    rate_card_id = Column(String(36), ForeignKey("rate_cards.id", ondelete="SET NULL"))
    description = Column(String(500), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)  # milli-units
    unit_price_cents = Column(Integer, nullable=False, default=0)
    amount_cents = Column(Integer, nullable=False, default=0)
