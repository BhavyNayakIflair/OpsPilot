"""OpsPilot AI Gateway Package."""
from app.ai.config import ai_settings
from app.ai.errors import (
    AIGatewayError,
    AICapacityExhausted,
    ProviderUnavailableError,
    CircuitBreakerOpenError,
    QuotaExceededError,
    SchemaValidationError,
    ForbiddenRouteError,
    DataPrivacyViolationError,
    DeadlineExceededError,
    ProviderError,
)

__all__ = [
    "ai_settings",
    "AIGatewayError",
    "AICapacityExhausted",
    "ProviderUnavailableError",
    "CircuitBreakerOpenError",
    "QuotaExceededError",
    "SchemaValidationError",
    "ForbiddenRouteError",
    "DataPrivacyViolationError",
    "DeadlineExceededError",
    "ProviderError",
]
