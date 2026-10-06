"""
PII Redaction and Re-identification Engine.
Redacts personal data before dispatching payloads to external cloud providers.
Maintains a local request-scoped mapping and restores original values on completion.
"""
import copy
import re
from typing import Any, Dict, List, Tuple
from pydantic import BaseModel


class PIIRedactor:
    """
    Regex-based PII detector and tokenizing redactor with lossless restoration.
    """

    # Comprehensive regexes for standard PII entities
    EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
    # Phone numbers (international and domestic formats)
    PHONE_REGEX = re.compile(
        r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b"
    )
    # Credit card patterns (13-19 digits, optional dashes/spaces)
    FIN_CARD_REGEX = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")
    # IBAN patterns
    IBAN_REGEX = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b")
    # SSN patterns
    SSN_REGEX = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

    def redact(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Redact sensitive identifiers from text.
        Returns: (redacted_text, token_map)
        Where token_map maps '{{ENTITY_N}}' -> original_value.
        """
        if not text:
            return "", {}

        token_map: Dict[str, str] = {}
        redacted = text

        counters = {"EMAIL": 1, "PHONE": 1, "FIN": 1, "SSN": 1}

        # 1. Redact SSNs
        def replace_ssn(match):
            val = match.group(0)
            token = f"{{{{SSN_{counters['SSN']}}}}}"
            counters["SSN"] += 1
            token_map[token] = val
            return token

        redacted = self.SSN_REGEX.sub(replace_ssn, redacted)

        # 2. Redact Financial Cards
        def replace_card(match):
            val = match.group(0)
            token = f"{{{{FIN_{counters['FIN']}}}}}"
            counters["FIN"] += 1
            token_map[token] = val
            return token

        redacted = self.FIN_CARD_REGEX.sub(replace_card, redacted)

        # 3. Redact IBANs
        def replace_iban(match):
            val = match.group(0)
            token = f"{{{{FIN_{counters['FIN']}}}}}"
            counters["FIN"] += 1
            token_map[token] = val
            return token

        redacted = self.IBAN_REGEX.sub(replace_iban, redacted)

        # 4. Redact Emails
        def replace_email(match):
            val = match.group(0)
            token = f"{{{{EMAIL_{counters['EMAIL']}}}}}"
            counters["EMAIL"] += 1
            token_map[token] = val
            return token

        redacted = self.EMAIL_REGEX.sub(replace_email, redacted)

        # 5. Redact Phones (only sequences with at least 7 digits to avoid small numbers)
        def replace_phone(match):
            val = match.group(0).strip()
            digits = re.sub(r"\D", "", val)
            if len(digits) >= 7:
                token = f"{{{{PHONE_{counters['PHONE']}}}}}"
                counters["PHONE"] += 1
                token_map[token] = val
                return token
            return val

        redacted = self.PHONE_REGEX.sub(replace_phone, redacted)

        return redacted, token_map

    def restore(self, text: str, token_map: Dict[str, str]) -> str:
        """Replace all {{ENTITY_N}} tokens in text with original values."""
        if not text or not token_map:
            return text
        restored = text
        for token, orig in token_map.items():
            restored = restored.replace(token, orig)
        return restored

    def restore_json(self, data: Any, token_map: Dict[str, str]) -> Any:
        """Recursively restore PII tokens in dicts, lists, strings, or Pydantic models."""
        if not token_map:
            return data

        if isinstance(data, str):
            return self.restore(data, token_map)

        if isinstance(data, dict):
            return {k: self.restore_json(v, token_map) for k, v in data.items()}

        if isinstance(data, list):
            return [self.restore_json(item, token_map) for item in data]

        if isinstance(data, BaseModel):
            dumped = data.model_dump()
            restored_dict = self.restore_json(dumped, token_map)
            return type(data).model_validate(restored_dict)

        return data
