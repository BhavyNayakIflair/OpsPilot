"""
Month-End Billing Anomaly Detection and Explanation Service.
Implements Rule R5 (Code computes numbers with Decimal) & Master Prompt Section 6.2:
- Deterministic detection of variance across invoice lines, expenses, and timesheets.
- LLM generates executive narrative and explanations citing exact entity IDs.
- Degraded mode fallback generates deterministic explanations citing exact row IDs if AI is unavailable.
"""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers.base import JsonRequest
from app.ai.routing.router import ai_router
from app.models.billing import Invoice, InvoiceLineItem, Expense
from app.models.operations import TimeEntry
from app.schemas.billing import AnomalyItem, BillingAnomalyReport

logger = logging.getLogger(__name__)


class AIExplanationItem(BaseModel):
    entity_id: str
    explanation: str
    risk_level: str = "medium"  # "low", "medium", "high"
    suggested_action: str


class AIBillingReport(BaseModel):
    executive_summary: str
    explanations: List[AIExplanationItem]
    recommendations: List[str]


async def detect_and_explain_anomalies(
    db: AsyncSession,
    org_id: str,
    period: Optional[str] = None,
) -> BillingAnomalyReport:
    """Detect month-end variances and synthesize explanations with exact cited row IDs."""
    period_str = period or datetime.now(timezone.utc).strftime("%Y-%m")

    # 1. Fetch data
    invoices = (await db.scalars(select(Invoice).where(Invoice.org_id == org_id))).all()
    invoice_ids = [inv.id for inv in invoices]
    lines: List[InvoiceLineItem] = []
    if invoice_ids:
        lines = (await db.scalars(
            select(InvoiceLineItem).where(
                InvoiceLineItem.org_id == org_id,
                InvoiceLineItem.invoice_id.in_(invoice_ids),
            )
        )).all()

    expenses = (await db.scalars(select(Expense).where(Expense.org_id == org_id))).all()
    timesheets = (await db.scalars(select(TimeEntry).where(TimeEntry.org_id == org_id))).all()

    detected: List[Dict[str, Any]] = []

    # 2. Deterministic computations with Decimal (Rule R5)
    if lines:
        total_line_amount = sum(Decimal(str(item.amount_cents)) for item in lines)
        avg_line_cents = (total_line_amount / Decimal(str(len(lines)))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        threshold_cents = avg_line_cents * Decimal("1.5")

        for item in lines:
            amt = Decimal(str(item.amount_cents))
            if amt > threshold_cents and amt > Decimal("50000"):  # > 1.5x avg and > $500
                diff = amt - avg_line_cents
                variance_pct = (diff / avg_line_cents * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                detected.append({
                    "entity_type": "invoice_line",
                    "entity_id": item.id,
                    "reference_id": item.invoice_id,
                    "description": item.description,
                    "metric": "amount_cents",
                    "actual_value": float(amt / Decimal("100")),
                    "expected_value": float(avg_line_cents / Decimal("100")),
                    "variance_percent": float(variance_pct),
                    "risk_level": "high" if amt > avg_line_cents * Decimal("2.5") else "medium",
                })

    # High expenses or pending expenses
    for exp in expenses:
        exp_amt = Decimal(str(exp.amount_cents))
        if exp_amt >= Decimal("100000"):  # >= $1,000
            diff = exp_amt - Decimal("25000")
            variance_pct = (diff / Decimal("25000") * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            detected.append({
                "entity_type": "expense",
                "entity_id": exp.id,
                "reference_id": None,
                "description": f"{exp.vendor}: {exp.description}",
                "metric": "amount_cents",
                "actual_value": float(exp_amt / Decimal("100")),
                "expected_value": 250.00,
                "variance_percent": float(variance_pct),
                "risk_level": "high" if exp_amt > Decimal("250000") else "medium",
            })

    # Timesheet anomalies (e.g. daily hours > 10h)
    for ts in timesheets:
        if ts.minutes > 600:  # > 10 hours in a single entry
            hrs = Decimal(str(ts.minutes)) / Decimal("60")
            variance_pct = ((hrs - Decimal("8")) / Decimal("8") * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            detected.append({
                "entity_type": "timesheet",
                "entity_id": ts.id,
                "reference_id": ts.project_id,
                "description": ts.description,
                "metric": "hours",
                "actual_value": float(hrs.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
                "expected_value": 8.0,
                "variance_percent": float(variance_pct),
                "risk_level": "medium",
            })

    # If no anomalies detected
    if not detected:
        return BillingAnomalyReport(
            period=period_str,
            anomalies_count=0,
            executive_summary="All invoice lines, expenses, and timesheets fall within normal statistical thresholds for this period.",
            anomalies=[],
            recommendations=["Continue routine billing and periodic reconciliation."],
        )

    # 3. Formulate Prompt for AIRouter (billing_explain task profile)
    items_summary = "\n".join([
        f"- ID: {d['entity_id']} | Type: {d['entity_type']} | Ref: {d.get('reference_id')} | "
        f"Desc: '{d['description']}' | Actual: {d['actual_value']} | Expected: {d['expected_value']} | "
        f"Variance: +{d['variance_percent']}% | Risk: {d['risk_level']}"
        for d in detected
    ])

    system_prompt = (
        "You are an expert financial controller and auditor. Analyze the detected month-end billing anomalies. "
        "Every single explanation must explicitly cite the exact entity_id of the item. "
        "Explain the business significance, root causes, and suggested action. "
        "Never invent entity IDs or change the numbers provided."
    )
    user_prompt = (
        f"Billing period: {period_str}\n"
        f"Detected anomalies:\n{items_summary}\n\n"
        "Provide an executive summary, item-by-item explanation citing entity_id, and 2-3 overall recommendations."
    )

    ai_explanations_map: Dict[str, AIExplanationItem] = {}
    executive_summary = f"Identified {len(detected)} operational anomalies requiring managerial review for period {period_str}."
    recommendations = [
        "Audit invoice lines with high variance before issuing to clients.",
        "Review large expense submissions with project managers.",
        "Verify high timesheet hours with employees.",
    ]

    try:
        req = JsonRequest(
            prompt=user_prompt,
            system=system_prompt,
            schema_model=AIBillingReport,
            task_type="billing_explain",
            org_id=org_id,
        )
        ai_res = await ai_router.execute_json("billing_explain", req)
        if ai_res and ai_res.parsed:
            report_data: AIBillingReport = ai_res.parsed
            executive_summary = report_data.executive_summary
            if report_data.recommendations:
                recommendations = report_data.recommendations
            for exp_item in report_data.explanations:
                ai_explanations_map[exp_item.entity_id] = exp_item
    except Exception as exc:
        logger.warning("AI anomaly explanation routing failed (falling back to degraded mode): %s", exc)
        executive_summary += " (AI narrative unavailable; structured rule summary provided)."

    # 4. Construct response with exact citations
    result_anomalies: List[AnomalyItem] = []
    for d in detected:
        eid = d["entity_id"]
        ai_info = ai_explanations_map.get(eid)
        if ai_info:
            explanation = ai_info.explanation
            action = ai_info.suggested_action
            risk = ai_info.risk_level
        else:
            explanation = (
                f"Variance of +{d['variance_percent']}% detected for {d['entity_type']} {eid} "
                f"(actual: {d['actual_value']}, baseline: {d['expected_value']})."
            )
            action = f"Verify item details and obtain approval for {eid}."
            risk = d["risk_level"]

        result_anomalies.append(
            AnomalyItem(
                entity_type=d["entity_type"],
                entity_id=eid,
                reference_id=d.get("reference_id"),
                metric=d["metric"],
                actual_value=d["actual_value"],
                expected_value=d["expected_value"],
                variance_percent=d["variance_percent"],
                risk_level=risk,
                explanation=explanation,
                suggested_action=action,
            )
        )

    return BillingAnomalyReport(
        period=period_str,
        anomalies_count=len(result_anomalies),
        executive_summary=executive_summary,
        anomalies=result_anomalies,
        recommendations=recommendations,
    )
