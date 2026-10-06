"""
Multi-Provider Failover Router with Deadline Budgeting and Circuit Breakers.
Routes tasks according to Task Profiles, handles automatic failover on 429/5xx/timeouts,
and raises typed AICapacityExhausted (never bare 502) when routes are exhausted.
"""
import copy
import logging
import time
from typing import Optional

from app.ai.cache import make_cache_key, semantic_cache
from app.ai.config import ai_settings
from app.ai.errors import (
    AICapacityExhausted,
    AIGatewayError,
    CircuitBreakerOpenError,
    DataPrivacyViolationError,
    ForbiddenRouteError,
    ProviderUnavailableError,
    QuotaExceededError,
    SchemaValidationError,
)
from app.ai.privacy.classifier import DataClassification, classify_data
from app.ai.privacy.injection import PromptInjectionGuard
from app.ai.privacy.pii import PIIRedactor
from app.ai.providers.base import JsonRequest, JsonResult, TextRequest, TextResult
from app.ai.providers.registry import get_provider_by_id
from app.ai.routing.breaker import circuit_breaker
from app.ai.routing.profiles import get_task_profiles
from app.ai.routing.quota import quota_ledger

logger = logging.getLogger(__name__)


class AIRouter:
    """
    Core routing engine.
    Ensures:
    1. Zero cost ($0.00 hard budget)
    2. Zero bare 502s (failover to next candidate, typed 503 on total exhaustion)
    3. Strict deadline budgeting (<= 25s total)
    4. Quota and breaker enforcement
    5. Cache-first lookup
    """

    def __init__(self):
        pass

    async def execute_json(self, task_profile_name: str, req: JsonRequest) -> JsonResult:
        profiles = get_task_profiles()
        profile = profiles.get(task_profile_name) or profiles.get("quote_draft") or (next(iter(profiles.values())) if profiles else None)
        if not profile:
            raise AICapacityExhausted("No task profile configured.", retry_after_seconds=30)

        # 1. Semantic Cache check
        schema_name = req.schema_model.__name__ if req.schema_model else ""
        cache_key = make_cache_key(
            task_type=task_profile_name,
            prompt=req.prompt,
            system=req.system,
            schema_name=schema_name,
            org_id=req.org_id,
        )
        cached = await semantic_cache.get(cache_key)
        if cached:
            logger.info("Semantic cache HIT for %s key=%s", task_profile_name, cache_key)
            parsed_data = cached.get("data")
            if req.schema_model and isinstance(parsed_data, dict):
                try:
                    parsed_data = req.schema_model.model_validate(parsed_data)
                except Exception:
                    pass
            return JsonResult(
                data=parsed_data,
                raw_text=cached.get("raw_text", ""),
                provider=cached.get("provider", "cache"),
                model=cached.get("model", "cached"),
                latency_ms=0.0,
                cache_hit=True,
            )

        # 2. Iterate through failover chain with deadline budget
        start_time = time.monotonic()
        total_deadline = min(req.timeout_seconds, profile.max_total_timeout_seconds)
        fallback_reasons = []

        for candidate in profile.chain:
            elapsed = time.monotonic() - start_time
            remaining_budget = total_deadline - elapsed
            if remaining_budget <= 0.5:
                logger.warning("Deadline budget exhausted (%g s) before route %s", total_deadline, candidate.provider)
                break

            route_id = f"{candidate.provider}:{candidate.model}"

            # Gate A: Privacy class check (Rule R9)
            if req.data_class == "confidential" and candidate.provider not in ("ollama", "mock"):
                logger.debug("Skipping route %s: confidential data cannot leave local perimeter", route_id)
                continue

            # Gate B: Circuit Breaker check
            if not await circuit_breaker.is_available(route_id):
                logger.debug("Skipping route %s: circuit breaker is OPEN", route_id)
                fallback_reasons.append(f"{route_id}: breaker open")
                continue

            # Gate C: Provider configured check
            provider_instance = get_provider_by_id(candidate.provider)
            if not provider_instance:
                continue

            # Check if API key is configured for built-in cloud providers
            if candidate.provider in ("groq", "gemini", "mistral", "openrouter"):
                key_attr = f"{candidate.provider.upper()}_API_KEY"
                if not getattr(ai_settings, key_attr, None):
                    continue
            elif candidate.provider == "cloudflare":
                if not (ai_settings.CF_ACCOUNT_ID and ai_settings.CF_API_TOKEN):
                    continue

            # Gate D: Quota Ledger pre-flight headroom check
            can_admit = await quota_ledger.can_admit(
                candidate.provider,
                candidate.model,
                estimated_input_tokens=len(req.prompt.split()) * 2,
                estimated_output_tokens=candidate.max_tokens,
            )
            if not can_admit:
                logger.debug("Skipping route %s: quota ledger refused (headroom guard)", route_id)
                fallback_reasons.append(f"{route_id}: quota limit")
                continue

            # Route attempt
            attempt_timeout = min(candidate.timeout_seconds, remaining_budget)
            attempt_req = copy.deepcopy(req)
            attempt_req.model = candidate.model
            attempt_req.temperature = candidate.temperature
            attempt_req.max_tokens = candidate.max_tokens
            attempt_req.timeout_seconds = attempt_timeout

            try:
                logger.info(
                    "Executing route %s for task=%s (timeout=%g s, remaining_budget=%g s)",
                    route_id,
                    task_profile_name,
                    attempt_timeout,
                    remaining_budget,
                )
                result = await provider_instance.generate_json(attempt_req)

                # Record success on breaker and quota ledger
                await circuit_breaker.record_success(route_id)
                await quota_ledger.record_usage(
                    candidate.provider,
                    candidate.model,
                    input_tokens=result.input_tokens or 0,
                    output_tokens=result.output_tokens or 0,
                )

                if fallback_reasons:
                    result.fallback_reason = " -> ".join(fallback_reasons)

                # Cache successful response
                if profile.cache_ttl_seconds > 0:
                    cache_payload = {
                        "data": result.data.model_dump() if hasattr(result.data, "model_dump") else result.data,
                        "raw_text": result.raw_text,
                        "provider": result.provider,
                        "model": result.model,
                    }
                    await semantic_cache.set(cache_key, cache_payload, ttl_seconds=profile.cache_ttl_seconds)

                return result

            except QuotaExceededError as exc:
                # 429: trip breaker immediately with Retry-After
                logger.warning("Route %s returned 429 rate limit; tripping breaker for %ds", route_id, exc.retry_after_seconds)
                await circuit_breaker.trip(route_id, exc.retry_after_seconds, reason=str(exc))
                fallback_reasons.append(f"{route_id}: 429 ({exc})")
                continue

            except ProviderUnavailableError as exc:
                # 5xx, 401/403 or network error
                logger.warning("Route %s unavailable (%s); failing over", route_id, exc)
                is_auth_error = "401" in str(exc) or "403" in str(exc)
                await circuit_breaker.record_failure(
                    route_id,
                    cooldown_seconds=3600 if is_auth_error else None,
                    is_fatal=is_auth_error,
                    reason=str(exc),
                )
                fallback_reasons.append(f"{route_id}: 5xx/unavailable")
                continue

            except SchemaValidationError as exc:
                # Model returned invalid JSON
                logger.warning("Route %s schema validation failed: %s; failing over", route_id, exc)
                await circuit_breaker.record_failure(route_id, reason="schema validation")
                fallback_reasons.append(f"{route_id}: schema invalid")
                continue

            except Exception as exc:
                logger.warning("Route %s failed with unexpected error: %s; failing over", route_id, exc)
                await circuit_breaker.record_failure(route_id, reason=str(exc))
                fallback_reasons.append(f"{route_id}: {type(exc).__name__}")
                continue

        # All routes exhausted in chain
        detail_msg = f"All AI routes exhausted for task '{task_profile_name}'. Attempts: {fallback_reasons}"
        logger.error(detail_msg)
        raise AICapacityExhausted(
            message="AI capacity reached or routes temporarily unavailable. Please edit manually or retry shortly.",
            retry_after_seconds=30,
        )

    async def execute_text(self, task_profile_name: str, req: TextRequest) -> TextResult:
        profiles = get_task_profiles()
        profile = profiles.get(task_profile_name) or profiles.get("extract_json") or (next(iter(profiles.values())) if profiles else None)
        if not profile:
            raise AICapacityExhausted("No task profile configured.", retry_after_seconds=30)

        start_time = time.monotonic()
        total_deadline = min(req.timeout_seconds, profile.max_total_timeout_seconds)
        fallback_reasons = []

        for candidate in profile.chain:
            elapsed = time.monotonic() - start_time
            remaining_budget = total_deadline - elapsed
            if remaining_budget <= 0.5:
                break

            route_id = f"{candidate.provider}:{candidate.model}"

            if req.data_class == "confidential" and candidate.provider not in ("ollama", "mock"):
                continue

            if not await circuit_breaker.is_available(route_id):
                fallback_reasons.append(f"{route_id}: breaker open")
                continue

            provider_instance = get_provider_by_id(candidate.provider)
            if not provider_instance:
                continue

            if candidate.provider in ("groq", "gemini", "mistral", "openrouter"):
                key_attr = f"{candidate.provider.upper()}_API_KEY"
                if not getattr(ai_settings, key_attr, None):
                    continue
            elif candidate.provider == "cloudflare":
                if not (ai_settings.CF_ACCOUNT_ID and ai_settings.CF_API_TOKEN):
                    continue

            attempt_timeout = min(candidate.timeout_seconds, remaining_budget)
            attempt_req = copy.deepcopy(req)
            attempt_req.model = candidate.model
            attempt_req.temperature = candidate.temperature
            attempt_req.max_tokens = candidate.max_tokens
            attempt_req.timeout_seconds = attempt_timeout

            try:
                result = await provider_instance.generate_text(attempt_req)
                await circuit_breaker.record_success(route_id)
                await quota_ledger.record_usage(
                    candidate.provider,
                    candidate.model,
                    input_tokens=result.input_tokens or 0,
                    output_tokens=result.output_tokens or 0,
                )
                if fallback_reasons:
                    result.fallback_reason = " -> ".join(fallback_reasons)
                return result
            except Exception as exc:
                await circuit_breaker.record_failure(route_id, reason=str(exc))
                fallback_reasons.append(f"{route_id}: {type(exc).__name__}")
                continue

        raise AICapacityExhausted(
            message="AI capacity reached or routes temporarily unavailable. Please edit manually or retry shortly.",
            retry_after_seconds=30,
        )


ai_router = AIRouter()
