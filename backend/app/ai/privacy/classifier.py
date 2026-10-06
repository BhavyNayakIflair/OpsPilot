"""
Data Classification Engine for OpsPilot AI Gateway.
Implements Rule R9: Privacy Matrix.
Three Tiers:
  - public_demo: generic marketing, boilerplate, demo templates. Any provider allowed.
  - internal: general business ops, customer tickets, standard quotes. Free cloud providers allowed.
  - confidential: payroll, compensation, financial ledgers, bank credentials, SSNs.
    Confidential data NEVER leaves the local machine (strictly routed to Ollama or Mock).
"""
import enum
import re
from typing import Optional


class DataClassification(str, enum.Enum):
    PUBLIC_DEMO = "public_demo"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"


# Keywords and patterns that automatically trigger confidential tier
CONFIDENTIAL_KEYWORDS = {
    "salary",
    "payroll",
    "compensation",
    "wage",
    "wages",
    "bank account",
    "routing number",
    "iban",
    "social security",
    "ssn",
    "credit card",
    "cvv",
    "card number",
    "financial ledger",
    "tax return",
    "passport number",
    "driver license",
    "trade secret",
    "confidential under nda",
}

# Regex patterns for high-sensitivity identifiers
SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")
IBAN_PATTERN = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b")


def classify_data(
    prompt: str,
    system: str = "",
    task_type: str = "general",
    explicit_class: Optional[str] = None,
) -> DataClassification:
    """
    Classify the confidentiality level of the payload.
    Elevates to CONFIDENTIAL if any financial, payroll, or credential patterns are detected.
    """
    combined_lower = f"{system} {prompt}".lower()

    # 1. Check for automated confidential triggers
    for kw in CONFIDENTIAL_KEYWORDS:
        if kw in combined_lower:
            return DataClassification.CONFIDENTIAL

    if SSN_PATTERN.search(prompt) or CREDIT_CARD_PATTERN.search(prompt) or IBAN_PATTERN.search(prompt):
        return DataClassification.CONFIDENTIAL

    # 2. Check explicit override if provided
    if explicit_class:
        normalized = explicit_class.strip().lower()
        if normalized == DataClassification.CONFIDENTIAL.value:
            return DataClassification.CONFIDENTIAL
        if normalized == DataClassification.PUBLIC_DEMO.value:
            return DataClassification.PUBLIC_DEMO
        if normalized == DataClassification.INTERNAL.value:
            return DataClassification.INTERNAL

    # 3. Task type heuristics
    if task_type in ("demo", "public_demo", "lead_capture"):
        return DataClassification.PUBLIC_DEMO

    # Default baseline for all enterprise business operations
    return DataClassification.INTERNAL
