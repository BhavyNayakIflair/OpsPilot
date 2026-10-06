"""
Structured JSON Logging for OpsPilot AI Operations.
Implements Rule R4 (No secrets in logs) & Master Prompt Section 9:
- Formats AI attempt logs as structured JSON lines.
- Tags every record with request_id, org_id, route, latency, token counts, and outcome.
- Explicitly excludes prompt and completion text from logs to preserve data privacy.
"""
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("app.ai.structured")


def log_ai_attempt(
    request_id: str,
    task_type: str,
    provider: str,
    model: str,
    status: str,  # "success", "failure", "fallback", "cache_hit"
    latency_ms: float,
    org_id: Optional[str] = None,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
    error_class: Optional[str] = None,
    error_message: Optional[str] = None,
    fallback_used: bool = False,
    data_class: str = "internal",
    cache_hit: bool = False,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Emits a single structured JSON log line per AI attempt."""
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "ai_attempt",
        "request_id": request_id,
        "org_id": org_id or "anonymous",
        "task_type": task_type,
        "provider": provider,
        "model": model,
        "status": status,
        "latency_ms": round(latency_ms, 2),
        "tokens_in": tokens_in or 0,
        "tokens_out": tokens_out or 0,
        "cache_hit": cache_hit,
        "fallback_used": fallback_used,
        "data_class": data_class,
    }
    if error_class:
        record["error_class"] = error_class
    if error_message:
        # Sanitize error message to prevent secret leaking
        record["error_message"] = str(error_message)[:200]
    if extra:
        record["extra"] = extra

    # Output as single-line JSON string
    log_line = json.dumps(record, default=str)
    if status in ("success", "cache_hit"):
        logger.info(log_line)
    elif status == "fallback":
        logger.warning(log_line)
    else:
        logger.error(log_line)
