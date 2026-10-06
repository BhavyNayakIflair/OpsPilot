"""Typed exception taxonomy for the OpsPilot AI Gateway."""
from typing import Optional


class AIGatewayError(RuntimeError):
    """Base exception for all AI Gateway operations."""

    def __init__(self, message: str, provider: Optional[str] = None, model: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.model = model


# Alias for backward compatibility with existing codebase
ProviderError = AIGatewayError


class ProviderUnavailableError(AIGatewayError):
    """Raised when an AI provider endpoint is down, unreachable, or returns 5xx."""
    pass


class AICapacityExhausted(AIGatewayError):
    """
    Raised when all candidate providers in the failover chain are exhausted.
    Maps to HTTP 503 with Retry-After and manual fallback, never bare 502.
    """

    def __init__(self, message: str = "All AI routes are temporarily unavailable or quota-exhausted.", retry_after_seconds: int = 60):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class CircuitBreakerOpenError(AIGatewayError):
    """Raised when a provider route circuit breaker is currently open."""
    pass


class QuotaExceededError(AIGatewayError):
    """Raised when RPM, RPD, TPM, or TPD limit has been reached for a route."""

    def __init__(self, message: str, retry_after_seconds: int = 30):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class SchemaValidationError(AIGatewayError):
    """Raised when model output fails strict Pydantic validation even after repair attempt."""
    pass


class ForbiddenRouteError(AIGatewayError):
    """Raised when a non-free or unapproved paid route is requested (enforces $0.00 hard budget)."""
    pass


class DataPrivacyViolationError(AIGatewayError):
    """Raised when a request data-class forbids transmission to the selected provider."""
    pass


class DeadlineExceededError(AIGatewayError):
    """Raised when the aggregate user-request deadline budget is exhausted."""
    pass
