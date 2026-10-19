"""
pdf_service.py
==============
Professional quotation PDF generator using ReportLab.

Produces:
  • Page 1 — Branded cover / quote details + line-item table + financial summary
  • Page 2 — Terms & Conditions

All colours and layout constants are defined at the top of this file so they
can be tweaked without touching the logic.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ---------------------------------------------------------------------------
# Design tokens
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN_H = 18 * mm
MARGIN_V = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_H

C_BRAND_DARK   = colors.HexColor("#0F172A")
C_BRAND_MID    = colors.HexColor("#1E3A5F")
C_BRAND_ACCENT = colors.HexColor("#3B82F6")
C_BRAND_LIGHT  = colors.HexColor("#EFF6FF")
C_GREY_BORDER  = colors.HexColor("#CBD5E1")
C_TEXT_DARK    = colors.HexColor("#0F172A")
C_TEXT_MID     = colors.HexColor("#475569")
C_TEXT_LIGHT   = colors.HexColor("#94A3B8")
C_WHITE        = colors.white

STATUS_COLORS = {
    "draft":          colors.HexColor("#F59E0B"),
    "sent":           colors.HexColor("#3B82F6"),
    "accepted":       colors.HexColor("#10B981"),
    "paid":           colors.HexColor("#10B981"),
    "partial":        colors.HexColor("#6366F1"),
    "partially_paid": colors.HexColor("#6366F1"),
    "declined":       colors.HexColor("#EF4444"),
    "void":           colors.HexColor("#64748B"),
    "expired":        colors.HexColor("#6B7280"),
}

FONT_BOLD = "Helvetica-Bold"
FONT_REG  = "Helvetica"
FONT_OBL  = "Helvetica-Oblique"

FS_HERO  = 26
FS_H1    = 16
FS_H2    = 12
FS_BODY  = 9.5
FS_SMALL = 8
FS_TINY  = 7


# ---------------------------------------------------------------------------
# Styles factory
# ---------------------------------------------------------------------------
def _styles() -> dict:
    base = getSampleStyleSheet()

    def s(name, **kw):
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        "quote_title":        s("quote_title",        fontName=FONT_BOLD,  fontSize=FS_H1,   textColor=C_BRAND_MID, spaceBefore=6, spaceAfter=2, leading=20),
        "section_header":     s("section_header",     fontName=FONT_BOLD,  fontSize=FS_H2,   textColor=C_BRAND_DARK, spaceBefore=10, spaceAfter=4),
        "body":               s("body",               fontName=FONT_REG,   fontSize=FS_BODY, textColor=C_TEXT_DARK, leading=14),
        "small":              s("small",              fontName=FONT_REG,   fontSize=FS_SMALL, textColor=C_TEXT_MID, leading=12),
        "tiny":               s("tiny",               fontName=FONT_OBL,   fontSize=FS_TINY,  textColor=C_TEXT_LIGHT, leading=10),
        "value":              s("value",              fontName=FONT_REG,   fontSize=FS_BODY,  textColor=C_TEXT_DARK, leading=13),
        "amount_right":       s("amount_right",       fontName=FONT_REG,   fontSize=FS_BODY,  textColor=C_TEXT_DARK, alignment=TA_RIGHT, leading=13),
        "amount_bold_right":  s("amount_bold_right",  fontName=FONT_BOLD,  fontSize=FS_BODY,  textColor=C_BRAND_MID, alignment=TA_RIGHT, leading=13),
        "tbl_header":         s("tbl_header",         fontName=FONT_BOLD,  fontSize=FS_SMALL, textColor=C_WHITE,     alignment=TA_LEFT,  leading=12),
        "tbl_header_right":   s("tbl_header_right",   fontName=FONT_BOLD,  fontSize=FS_SMALL, textColor=C_WHITE,     alignment=TA_RIGHT, leading=12),
        "tbl_cell":           s("tbl_cell",           fontName=FONT_REG,   fontSize=FS_SMALL, textColor=C_TEXT_DARK, alignment=TA_LEFT,  leading=12),
        "tbl_cell_right":     s("tbl_cell_right",     fontName=FONT_REG,   fontSize=FS_SMALL, textColor=C_TEXT_DARK, alignment=TA_RIGHT, leading=12),
        "tc_h1":              s("tc_h1",              fontName=FONT_BOLD,  fontSize=FS_H1,    textColor=C_BRAND_MID, spaceBefore=4, spaceAfter=6, leading=20),
        "tc_h2":              s("tc_h2",              fontName=FONT_BOLD,  fontSize=FS_SMALL, textColor=C_BRAND_DARK, spaceBefore=10, spaceAfter=2, leading=13),
        "tc_body":            s("tc_body",            fontName=FONT_REG,   fontSize=FS_SMALL, textColor=C_TEXT_DARK, leading=14, spaceAfter=2),
    }


# ---------------------------------------------------------------------------
# Page canvas callbacks
# ---------------------------------------------------------------------------
def _draw_quote_page(canvas, doc, org, quote):
    """Draws the branded dark header band and footer on every quotation page."""
    canvas.saveState()

    # ── Dark header band ──────────────────────────────────────────────────
    band_h = 52 * mm
    canvas.setFillColor(C_BRAND_DARK)
    canvas.rect(0, PAGE_H - band_h, PAGE_W, band_h, fill=1, stroke=0)
    # accent stripe at bottom of band
    canvas.setFillColor(C_BRAND_ACCENT)
    canvas.rect(0, PAGE_H - band_h, PAGE_W, 2, fill=1, stroke=0)

    # Organisation name (top-left)
    canvas.setFont(FONT_BOLD, 20)
    canvas.setFillColor(C_WHITE)
    canvas.drawString(MARGIN_H, PAGE_H - 20 * mm, org.name)

    # Org contact line (website · phone · email)
    org_settings = getattr(org, "settings", {}) or {}
    meta_parts = [v for k in ("website", "phone", "email")
                  if (v := org_settings.get(k))]
    if meta_parts:
        canvas.setFont(FONT_REG, 8)
        canvas.setFillColor(colors.HexColor("#93C5FD"))
        canvas.drawString(MARGIN_H, PAGE_H - 28 * mm, "  ·  ".join(meta_parts))

    # Quote ref (top-right)
    canvas.setFont(FONT_BOLD, 9)
    canvas.setFillColor(C_WHITE)
    canvas.drawRightString(PAGE_W - MARGIN_H, PAGE_H - 20 * mm,
                           f"QUOTE REF: {quote.id[:8].upper()}")

    # Status badge (top-right, below ref)
    status = (quote.status or "draft").lower()
    badge_color = STATUS_COLORS.get(status, C_TEXT_MID)
    bw, bh = 48, 14
    bx = PAGE_W - MARGIN_H - bw
    by = PAGE_H - 31 * mm
    canvas.setFillColor(badge_color)
    canvas.roundRect(bx, by, bw, bh, 3, fill=1, stroke=0)
    canvas.setFont(FONT_BOLD, 7.5)
    canvas.setFillColor(C_WHITE)
    canvas.drawCentredString(bx + bw / 2, by + 4, status.upper())

    # ── Footer ────────────────────────────────────────────────────────────
    footer_y = 10 * mm
    canvas.setStrokeColor(C_GREY_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_H, footer_y + 7, PAGE_W - MARGIN_H, footer_y + 7)
    canvas.setFont(FONT_REG, 6.5)
    canvas.setFillColor(C_TEXT_LIGHT)
    ts = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    canvas.drawString(MARGIN_H, footer_y, f"Generated by OpsPilot  ·  {ts}")
    canvas.drawRightString(PAGE_W - MARGIN_H, footer_y,
                           f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def _draw_tc_page(canvas, doc, org, quote):
    """Draws a lighter header and footer on every T&C page."""
    canvas.saveState()
    # thin accent bar
    canvas.setFillColor(C_BRAND_ACCENT)
    canvas.rect(0, PAGE_H - 6, PAGE_W, 6, fill=1, stroke=0)

    # org name + section label
    canvas.setFont(FONT_BOLD, 8)
    canvas.setFillColor(C_TEXT_MID)
    canvas.drawString(MARGIN_H, PAGE_H - 14 * mm,
                      org.name + "  –  Terms & Conditions")
    canvas.drawRightString(PAGE_W - MARGIN_H, PAGE_H - 14 * mm,
                           f"Quote Ref: {quote.id[:8].upper()}")

    canvas.setStrokeColor(C_GREY_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_H, PAGE_H - 16 * mm, PAGE_W - MARGIN_H, PAGE_H - 16 * mm)

    # footer
    footer_y = 10 * mm
    canvas.line(MARGIN_H, footer_y + 7, PAGE_W - MARGIN_H, footer_y + 7)
    canvas.setFont(FONT_REG, 6.5)
    canvas.setFillColor(C_TEXT_LIGHT)
    canvas.drawString(MARGIN_H, footer_y,
                      "Confidential – For the intended recipient only")
    canvas.drawRightString(PAGE_W - MARGIN_H, footer_y,
                           f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _fmt(amount_cents: int, currency: str) -> str:
    """Format an integer-cents amount with the appropriate currency symbol."""
    syms = {"USD": "$", "EUR": "€", "GBP": "£", "INR": "₹",
            "AUD": "A$", "CAD": "C$", "SGD": "S$"}
    sym = syms.get(currency.upper(), f"{currency.upper()} ")
    return f"{sym}{amount_cents / 100:,.2f}"


def _bps(bps: int) -> str:
    """Format basis-points (e.g. 1050 → '10.50%')."""
    return f"{bps / 100:.2f}%"


DEFAULT_TC_CLAUSES = [
    ("1. Validity",
     "This quotation is valid for 30 days from the date of issue unless a different validity "
     "period is stated above. After this period, prices and availability are subject to change "
     "without notice."),
    ("2. Payment Terms",
     "Payment is due within 14 days of invoice date unless otherwise agreed in writing. "
     "Invoices unpaid after the due date will accrue interest at 2% per month on the "
     "outstanding balance."),
    ("3. Scope of Work",
     "The deliverables, milestones, and acceptance criteria are as described in the line items "
     "above. Any work outside this scope will be quoted and billed separately."),
    ("4. Intellectual Property",
     "Upon receipt of full payment, the client shall own all custom deliverables produced under "
     "this agreement. Pre-existing IP, frameworks, and libraries remain the property of the "
     "supplier and are licensed on a non-exclusive basis."),
    ("5. Confidentiality",
     "Both parties agree to keep confidential all proprietary information exchanged under this "
     "engagement and not to disclose it to third parties without prior written consent."),
    ("6. Limitation of Liability",
     "The supplier's total liability under this agreement shall not exceed the total fees paid "
     "in the 3 months prior to the claim. Neither party shall be liable for indirect or "
     "consequential losses."),
    ("7. Governing Law",
     "This agreement shall be governed by and construed in accordance with the applicable local "
     "laws. Any disputes shall first be referred to mediation before resorting to legal "
     "proceedings."),
    ("8. Acceptance",
     "This quotation is deemed accepted upon receipt of a written confirmation, a purchase order "
     "referencing this quote number, or use of the electronic acceptance link provided. Once "
     "accepted, a binding contract is formed under these terms."),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def generate_quote_pdf(
    org: Any,
    quote: Any,
    lines: List[Any],
    generated_by: str = "OpsPilot",
    lead: Optional[Any] = None,
    contact: Optional[Any] = None,
    company: Optional[Any] = None,
) -> bytes:
    """Return raw PDF bytes for a professional quotation document.

    Parameters
    ----------
    org : Organization – the issuing organisation.
    quote : Quote – the quote record.
    lines : list[QuoteLineItem] – the line-items.
    generated_by : str – user / system label shown on the PDF.
    lead : Lead | None – the linked lead (optional).
    contact : Contact | None – the linked contact (optional).
    company : Company | None – the linked company (optional).
    """

    buf = io.BytesIO()
    st = _styles()
    currency = quote.currency.upper()
    org_settings = getattr(org, "settings", {}) or {}

    # ── Document ──────────────────────────────────────────────────────────
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN_H,
        rightMargin=MARGIN_H,
        topMargin=56 * mm,
        bottomMargin=22 * mm,
        title=f"Quotation – {quote.title}",
        author=org.name,
        subject="Quotation",
        creator="OpsPilot",
    )

    frame_quote = Frame(MARGIN_H, 22 * mm, CONTENT_W,
                        PAGE_H - 56 * mm - 22 * mm, id="quote")
    frame_tc    = Frame(MARGIN_H, 22 * mm, CONTENT_W,
                        PAGE_H - 22 * mm - 22 * mm,  id="tc")

    def _qp(canvas, _doc):
        _draw_quote_page(canvas, _doc, org, quote)

    def _tcp(canvas, _doc):
        _draw_tc_page(canvas, _doc, org, quote)

    doc.addPageTemplates([
        PageTemplate(id="QuotePage", frames=[frame_quote], onPage=_qp),
        PageTemplate(id="TCPage",    frames=[frame_tc],    onPage=_tcp),
    ])

    story: list = []

    # ── Quote title + description ─────────────────────────────────────────
    story.append(Paragraph(quote.title, st["quote_title"]))
    if quote.description:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(quote.description, st["body"]))
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width=CONTENT_W, thickness=1.5,
                             color=C_BRAND_ACCENT, spaceAfter=5 * mm))

    # ── Info grid  (two columns: quote meta | recipient) ──────────────────
    issue_date = quote.created_at.strftime("%d %b %Y") if quote.created_at else "—"
    left_pairs = [
        ("Quote Ref",    quote.id[:8].upper()),
        ("Issue Date",   issue_date),
        ("Valid Until",  "30 days from issue"),
        ("Prepared By",  generated_by),
        ("Currency",     currency),
        ("Status",       (quote.status or "draft").capitalize()),
    ]
    right_pairs: list[tuple[str, str]] = []
    if company:
        right_pairs.append(("Client",   company.name))
        if company.website:
            right_pairs.append(("Website",  company.website))
        if company.industry:
            right_pairs.append(("Industry", company.industry))
    if contact:
        right_pairs.append(("Contact", f"{contact.first_name} {contact.last_name}"))
        if contact.email:
            right_pairs.append(("Email",    contact.email))
        if contact.phone:
            right_pairs.append(("Phone",    contact.phone))
        if contact.title:
            right_pairs.append(("Title",    contact.title))
    if lead:
        right_pairs.append(("Lead Ref", lead.title))
    if not right_pairs:
        right_pairs = [("Prepared For", org.name)]

    def _col_content(pairs):
        col = []
        for k, v in pairs:
            col.append(Paragraph(f"<b>{k}</b>", st["small"]))
            col.append(Paragraph(v or "—", st["value"]))
            col.append(Spacer(1, 1.5 * mm))
        return col

    cw = CONTENT_W / 2 - 5 * mm
    info_tbl = Table(
        [[_col_content(left_pairs), _col_content(right_pairs)]],
        colWidths=[cw, cw],
    )
    info_tbl.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 7 * mm))

    # ── Line-item table ───────────────────────────────────────────────────
    story.append(Paragraph("Line Items", st["section_header"]))
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5,
                             color=C_GREY_BORDER, spaceAfter=3 * mm))

    cws = [CONTENT_W * 0.44, CONTENT_W * 0.14,
           CONTENT_W * 0.21, CONTENT_W * 0.21]
    tbl_data = [[
        Paragraph("DESCRIPTION", st["tbl_header"]),
        Paragraph("QTY",         st["tbl_header_right"]),
        Paragraph("UNIT PRICE",  st["tbl_header_right"]),
        Paragraph("AMOUNT",      st["tbl_header_right"]),
    ]]
    for item in lines:
        tbl_data.append([
            Paragraph(item.description, st["tbl_cell"]),
            Paragraph(str(item.quantity), st["tbl_cell_right"]),
            Paragraph(_fmt(item.unit_price_cents, currency), st["tbl_cell_right"]),
            Paragraph(_fmt(item.amount_cents,     currency), st["tbl_cell_right"]),
        ])

    items_tbl = Table(tbl_data, colWidths=cws, repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  C_BRAND_MID),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_BRAND_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.4, C_GREY_BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
        ("FONTSIZE",      (0, 0), (-1, 0),  FS_SMALL),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  C_WHITE),
        ("LINEBELOW",     (0, -1), (-1, -1), 1, C_BRAND_ACCENT),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 5 * mm))

    # ── Financial summary ─────────────────────────────────────────────────
    subtotal    = quote.subtotal_cents
    total       = quote.total_cents
    disc_bps    = quote.discount_bps or 0
    tax_bps     = quote.tax_bps or 0
    disc_amt    = subtotal - (subtotal * (10000 - disc_bps) + 5000) // 10000
    tax_base    = subtotal - disc_amt
    tax_amt     = (tax_base * tax_bps + 5000) // 10000

    sum_rows = [("Subtotal", _fmt(subtotal, currency))]
    if disc_bps:
        sum_rows.append((f"Discount ({_bps(disc_bps)})",
                         f"– {_fmt(disc_amt, currency)}"))
    if tax_bps:
        sum_rows.append((f"Tax / GST ({_bps(tax_bps)})",
                         _fmt(tax_amt, currency)))
    sum_rows.append(("TOTAL DUE", _fmt(total, currency)))

    sw1, sw2 = 50 * mm, 38 * mm
    sum_data = [
        [Paragraph(lbl, st["amount_bold_right"] if i == len(sum_rows) - 1 else st["amount_right"]),
         Paragraph(val, st["amount_bold_right"] if i == len(sum_rows) - 1 else st["amount_right"])]
        for i, (lbl, val) in enumerate(sum_rows)
    ]
    sum_tbl = Table(sum_data, colWidths=[sw1, sw2], hAlign="RIGHT")
    sum_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("LINEABOVE",     (0, -1), (-1, -1), 1.5, C_BRAND_ACCENT),
        ("LINEBELOW",     (0, -1), (-1, -1), 1.5, C_BRAND_ACCENT),
        ("BACKGROUND",    (0, -1), (-1, -1), C_BRAND_LIGHT),
        ("FONTNAME",      (0, -1), (-1, -1), FONT_BOLD),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 8 * mm))

    # ── Org contact footer block ──────────────────────────────────────────
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5,
                             color=C_GREY_BORDER, spaceAfter=4 * mm))
    cp = [f"<b>{org.name}</b>"]
    if org_settings.get("address"):
        cp.append(org_settings["address"])
    if org_settings.get("phone"):
        cp.append(f"Tel: {org_settings['phone']}")
    if org_settings.get("email"):
        cp.append(org_settings["email"])
    if org_settings.get("website"):
        cp.append(org_settings["website"])
    story.append(Paragraph("  ·  ".join(cp), st["small"]))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Generated by <b>OpsPilot</b>. Questions? Contact us via the details above.",
        st["tiny"],
    ))

    # ── Page 2 – Terms & Conditions ──────────────────────────────────────
    story.append(NextPageTemplate("TCPage"))
    story.append(PageBreak())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Terms & Conditions", st["tc_h1"]))
    story.append(Paragraph(
        f"These terms apply to Quotation Ref <b>{quote.id[:8].upper()}</b> "
        f"issued by <b>{org.name}</b>.",
        st["tc_body"],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width=CONTENT_W, thickness=1,
                             color=C_BRAND_ACCENT, spaceAfter=5 * mm))

    if quote.terms:
        story.append(Paragraph(quote.terms, st["tc_body"]))
    else:
        for heading, body_text in DEFAULT_TC_CLAUSES:
            story.append(Paragraph(heading, st["tc_h2"]))
            story.append(Paragraph(body_text, st["tc_body"]))

    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5,
                             color=C_GREY_BORDER, spaceAfter=4 * mm))

    # ── Signature block ──────────────────────────────────────────────────
    sw = CONTENT_W / 2 - 6 * mm
    sig_tbl = Table([[
        [Paragraph("<b>Authorised by (Supplier)</b>", st["small"]),
         Spacer(1, 14 * mm),
         HRFlowable(width=sw * 0.8, thickness=0.5, color=C_TEXT_MID),
         Spacer(1, 2 * mm),
         Paragraph("Name / Signature / Date", st["tiny"])],
        [Paragraph("<b>Accepted by (Client)</b>", st["small"]),
         Spacer(1, 14 * mm),
         HRFlowable(width=sw * 0.8, thickness=0.5, color=C_TEXT_MID),
         Spacer(1, 2 * mm),
         Paragraph("Name / Signature / Date", st["tiny"])],
    ]], colWidths=[sw, sw])
    sig_tbl.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(sig_tbl)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        f"Document generated on "
        f"{datetime.now(timezone.utc).strftime('%d %B %Y at %H:%M UTC')} "
        "via OpsPilot. This is a computer-generated document.",
        st["tiny"],
    ))

    doc.build(story)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Invoice PDF Generator
# ---------------------------------------------------------------------------
def _draw_invoice_page(canvas, doc, org, invoice):
    """Draws branded header band and footer on invoice pages."""
    canvas.saveState()

    # Dark branded header band
    band_h = 52 * mm
    canvas.setFillColor(C_BRAND_DARK)
    canvas.rect(0, PAGE_H - band_h, PAGE_W, band_h, fill=1, stroke=0)
    canvas.setFillColor(C_BRAND_ACCENT)
    canvas.rect(0, PAGE_H - band_h, PAGE_W, 2, fill=1, stroke=0)

    # Organisation name
    canvas.setFont(FONT_BOLD, 20)
    canvas.setFillColor(C_WHITE)
    canvas.drawString(MARGIN_H, PAGE_H - 20 * mm, org.name)

    # Org meta parts (address, tax id, contact)
    org_settings = getattr(org, "settings", {}) or {}
    meta_parts = []
    if org_settings.get("address"):
        meta_parts.append(org_settings["address"])
    if org_settings.get("email"):
        meta_parts.append(org_settings["email"])
    if org_settings.get("tax_id"):
        meta_parts.append(f"Tax ID: {org_settings['tax_id']}")
    if meta_parts:
        canvas.setFont(FONT_REG, 8)
        canvas.setFillColor(colors.HexColor("#93C5FD"))
        canvas.drawString(MARGIN_H, PAGE_H - 28 * mm, "  ·  ".join(meta_parts))

    # Invoice number (top-right)
    canvas.setFont(FONT_BOLD, 9)
    canvas.setFillColor(C_WHITE)
    canvas.drawRightString(PAGE_W - MARGIN_H, PAGE_H - 20 * mm, f"INVOICE: {invoice.invoice_number}")

    # Status badge (top-right, below ref)
    status = (invoice.status or "draft").lower()
    badge_color = STATUS_COLORS.get(status, C_TEXT_MID)
    bw, bh = 56, 14
    bx = PAGE_W - MARGIN_H - bw
    by = PAGE_H - 31 * mm
    canvas.setFillColor(badge_color)
    canvas.roundRect(bx, by, bw, bh, 3, fill=1, stroke=0)
    canvas.setFont(FONT_BOLD, 7.5)
    canvas.setFillColor(C_WHITE)
    canvas.drawCentredString(bx + bw / 2, by + 4, status.replace("_", " ").upper())

    # Footer
    footer_y = 10 * mm
    canvas.setStrokeColor(C_GREY_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_H, footer_y + 7, PAGE_W - MARGIN_H, footer_y + 7)
    canvas.setFont(FONT_REG, 6.5)
    canvas.setFillColor(C_TEXT_LIGHT)
    ts = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    canvas.drawString(MARGIN_H, footer_y, f"Generated by OpsPilot  ·  {ts}")
    canvas.drawRightString(PAGE_W - MARGIN_H, footer_y, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def generate_invoice_pdf(
    org: Any,
    invoice: Any,
    lines: List[Any],
    project: Optional[Any] = None,
    payments: Optional[List[Any]] = None,
) -> bytes:
    """Return raw PDF bytes for an invoice document with multi-page table wrapping,
    server-side computed totals, payment summary, and notes.
    """
    buf = io.BytesIO()
    st = _styles()
    currency = (invoice.currency or "USD").upper()
    org_settings = getattr(org, "settings", {}) or {}

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN_H,
        rightMargin=MARGIN_H,
        topMargin=56 * mm,
        bottomMargin=22 * mm,
        title=f"Invoice – {invoice.invoice_number}",
        author=org.name,
        subject="Invoice",
        creator="OpsPilot",
    )

    frame = Frame(MARGIN_H, 22 * mm, CONTENT_W, PAGE_H - 56 * mm - 22 * mm, id="inv_frame")

    def _ip(canvas, _doc):
        _draw_invoice_page(canvas, _doc, org, invoice)

    doc.addPageTemplates([
        PageTemplate(id="InvoicePage", frames=[frame], onPage=_ip),
    ])

    story: list = []

    # Title
    story.append(Paragraph(f"Tax Invoice — {invoice.invoice_number}", st["quote_title"]))
    if project:
        story.append(Spacer(1, 1 * mm))
        story.append(Paragraph(f"Project: <b>{project.name}</b>", st["body"]))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width=CONTENT_W, thickness=1.5, color=C_BRAND_ACCENT, spaceAfter=4 * mm))

    # Info grid: 2 columns (Invoice Details | Client Details)
    left_pairs = [
        ("Invoice Number", invoice.invoice_number),
        ("Issue Date",     invoice.issue_date.strftime("%d %b %Y") if invoice.issue_date else "—"),
        ("Due Date",       invoice.due_date.strftime("%d %b %Y") if invoice.due_date else "—"),
        ("Currency",       currency),
        ("Status",         (invoice.status or "draft").replace("_", " ").capitalize()),
    ]
    right_pairs = [
        ("Billed To",      invoice.client_name),
        ("Payment Terms",  "Net 30" if not invoice.notes else "As stated in terms"),
    ]
    if getattr(invoice, "project_id", None) and project:
        right_pairs.append(("Engagement", project.name))

    def _col_content(pairs):
        col = []
        for k, v in pairs:
            col.append(Paragraph(f"<b>{k}</b>", st["small"]))
            col.append(Paragraph(str(v or "—"), st["value"]))
            col.append(Spacer(1, 1.5 * mm))
        return col

    cw = CONTENT_W / 2 - 5 * mm
    info_tbl = Table(
        [[_col_content(left_pairs), _col_content(right_pairs)]],
        colWidths=[cw, cw],
    )
    info_tbl.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 6 * mm))

    # Line Items Table
    story.append(Paragraph("Line Items", st["section_header"]))
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5, color=C_GREY_BORDER, spaceAfter=3 * mm))

    cws = [CONTENT_W * 0.46, CONTENT_W * 0.14, CONTENT_W * 0.20, CONTENT_W * 0.20]
    tbl_data = [[
        Paragraph("DESCRIPTION", st["tbl_header"]),
        Paragraph("QTY / HRS",   st["tbl_header_right"]),
        Paragraph("UNIT PRICE",  st["tbl_header_right"]),
        Paragraph("AMOUNT",      st["tbl_header_right"]),
    ]]

    if not lines:
        tbl_data.append([
            Paragraph("No line items specified", st["tbl_cell"]),
            Paragraph("0", st["tbl_cell_right"]),
            Paragraph(_fmt(0, currency), st["tbl_cell_right"]),
            Paragraph(_fmt(0, currency), st["tbl_cell_right"]),
        ])
    else:
        for item in lines:
            tbl_data.append([
                Paragraph(item.description or "—", st["tbl_cell"]),
                Paragraph(str(item.quantity), st["tbl_cell_right"]),
                Paragraph(_fmt(item.unit_price_cents, currency), st["tbl_cell_right"]),
                Paragraph(_fmt(item.amount_cents, currency), st["tbl_cell_right"]),
            ])

    items_tbl = Table(tbl_data, colWidths=cws, repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  C_BRAND_MID),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_BRAND_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.4, C_GREY_BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
        ("FONTSIZE",      (0, 0), (-1, 0),  FS_SMALL),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  C_WHITE),
        ("LINEBELOW",     (0, -1), (-1, -1), 1, C_BRAND_ACCENT),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 5 * mm))

    # Financial summary
    subtotal = invoice.subtotal_cents
    disc_cents = getattr(invoice, "discount_cents", 0) or 0
    tax = invoice.tax_cents
    total = invoice.total_cents
    paid = invoice.paid_cents
    balance_due = max(0, total - paid)

    sum_rows = [("Subtotal", _fmt(subtotal, currency))]
    if disc_cents > 0:
        sum_rows.append(("Discount", f"– {_fmt(disc_cents, currency)}"))
    if tax > 0:
        sum_rows.append(("Tax", _fmt(tax, currency)))
    sum_rows.append(("Total Amount", _fmt(total, currency)))
    if paid > 0:
        sum_rows.append(("Amount Paid", f"– {_fmt(paid, currency)}"))
    sum_rows.append(("BALANCE DUE", _fmt(balance_due, currency)))

    sw1, sw2 = 50 * mm, 42 * mm
    sum_data = [
        [Paragraph(lbl, st["amount_bold_right"] if i == len(sum_rows) - 1 else st["amount_right"]),
         Paragraph(val, st["amount_bold_right"] if i == len(sum_rows) - 1 else st["amount_right"])]
        for i, (lbl, val) in enumerate(sum_rows)
    ]
    sum_tbl = Table(sum_data, colWidths=[sw1, sw2], hAlign="RIGHT")
    sum_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("LINEABOVE",     (0, -1), (-1, -1), 1.5, C_BRAND_ACCENT),
        ("LINEBELOW",     (0, -1), (-1, -1), 1.5, C_BRAND_ACCENT),
        ("BACKGROUND",    (0, -1), (-1, -1), C_BRAND_LIGHT),
        ("FONTNAME",      (0, -1), (-1, -1), FONT_BOLD),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 6 * mm))

    # Notes & Payment details
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5, color=C_GREY_BORDER, spaceAfter=4 * mm))
    story.append(Paragraph("<b>Payment Instructions & Notes</b>", st["small"]))
    notes_text = invoice.notes or "Please include invoice number on all payments. Thank you for your business!"
    story.append(Paragraph(notes_text, st["body"]))
    story.append(Spacer(1, 3 * mm))

    if org_settings.get("bank_instructions"):
        story.append(Paragraph(f"<b>Remittance:</b> {org_settings['bank_instructions']}", st["small"]))

    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        f"Invoice generated via <b>OpsPilot</b> on "
        f"{datetime.now(timezone.utc).strftime('%d %B %Y at %H:%M UTC')}. "
        "Questions? Contact accounts receivable at "
        f"{org_settings.get('email', 'billing@opspilot.local')}.",
        st["tiny"],
    ))

    doc.build(story)
    return buf.getvalue()

