"""
Multi-Provider Failover Router with Deadline Budgeting and Circuit Breakers.
Routes tasks according to Task Profiles, handles automatic failover on 429/5xx/timeouts,
and raises typed AICapacityExhausted (never bare 502) when routes are exhausted.
"""
import copy
import logging
import time
import uuid
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
from app.ai.observability.logger import log_ai_attempt
from app.ai.observability.metrics import ai_metrics
from app.ai.observability.tracing import tracer
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
        self.pii_redactor = PIIRedactor()

    async def execute_json(self, task_profile_name: str, req: JsonRequest) -> JsonResult:
        profiles = get_task_profiles()
        profile = profiles.get(task_profile_name) or profiles.get("quote_draft") or (next(iter(profiles.values())) if profiles else None)
        if not profile:
            raise AICapacityExhausted("No task profile configured.", retry_after_seconds=30)

        # 0. Data Classification (Rule R9)
        effective_data_class = classify_data(
            prompt=req.prompt,
            system=req.system,
            task_type=task_profile_name,
            explicit_class=req.data_class,
        )

        # 1. Semantic Cache check
        schema_name = req.schema_model.__name__ if req.schema_model else ""
        cache_key = make_cache_key(
            task_type=task_profile_name,
            prompt=req.prompt,
            system=req.system,
            schema_name=schema_name,
            org_id=req.org_id,
        )
        request_id = f"req_{uuid.uuid4().hex[:12]}"
        trace = tracer.start_trace(
            name=f"ai:{task_profile_name}",
            org_id=req.org_id,
            data_class=str(effective_data_class),
            metadata={"schema": schema_name},
        )

        cached = await semantic_cache.get(cache_key)
        if cached:
            logger.info("Semantic cache HIT for %s key=%s", task_profile_name, cache_key)
            ai_metrics.record_cache_hit(task_profile_name)
            log_ai_attempt(
                request_id=request_id,
                task_type=task_profile_name,
                provider="cache",
                model="cached",
                status="cache_hit",
                latency_ms=0.0,
                org_id=req.org_id,
                cache_hit=True,
                data_class=str(effective_data_class),
            )
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
            if effective_data_class == DataClassification.CONFIDENTIAL and candidate.provider not in ("ollama", "mock"):
                logger.debug("Skipping route %s: confidential data cannot leave local perimeter", route_id)
                fallback_reasons.append(f"{route_id}: confidential privacy boundary")
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
            attempt_start = time.monotonic()
            ai_metrics.record_attempt(route_id)
            span = tracer.record_attempt_span(
                trace,
                span_name=route_id,
                provider=candidate.provider,
                model=candidate.model,
                data_class=str(effective_data_class),
                prompt=req.prompt,
            )

            # Privacy & Safety Transformations
            combined_pii_map = {}
            if candidate.provider not in ("ollama", "mock"):
                red_p, pii_p = self.pii_redactor.redact(req.prompt)
                red_s, pii_s = self.pii_redactor.redact(req.system)
                combined_pii_map = {**pii_p, **pii_s}
                safe_prompt = PromptInjectionGuard.delimit_user_input(red_p)
                safe_system = PromptInjectionGuard.harden_system_prompt(red_s)
            else:
                safe_prompt = PromptInjectionGuard.delimit_user_input(req.prompt)
                safe_system = PromptInjectionGuard.harden_system_prompt(req.system)

            attempt_req.prompt = safe_prompt
            attempt_req.system = safe_system
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
                attempt_lat = (time.monotonic() - attempt_start) * 1000

                # Lossless PII restoration
                if combined_pii_map:
                    result.data = self.pii_redactor.restore_json(result.data, combined_pii_map)
                    result.raw_text = self.pii_redactor.restore(result.raw_text, combined_pii_map)

                # Record success on breaker and quota ledger
                await circuit_breaker.record_success(route_id)
                await quota_ledger.record_usage(
                    candidate.provider,
                    candidate.model,
                    input_tokens=result.input_tokens or 0,
                    output_tokens=result.output_tokens or 0,
                )
                ai_metrics.record_success(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="success",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    tokens_in=result.input_tokens,
                    tokens_out=result.output_tokens,
                    fallback_used=bool(fallback_reasons),
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=1.0)
                span.score(name="fallback_used", value=1.0 if fallback_reasons else 0.0)
                span.end()

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

                tracer.flush()
                return result

            except QuotaExceededError as exc:
                attempt_lat = (time.monotonic() - attempt_start) * 1000
                ai_metrics.record_failure(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="fallback",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    error_class="QuotaExceededError",
                    error_message=str(exc),
                    fallback_used=True,
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=0.0)
                span.end()
                logger.warning("Route %s returned 429 rate limit; tripping breaker for %ds", route_id, exc.retry_after_seconds)
                await circuit_breaker.trip(route_id, exc.retry_after_seconds, reason=str(exc))
                fallback_reasons.append(f"{route_id}: 429 ({exc})")
                continue

            except ProviderUnavailableError as exc:
                attempt_lat = (time.monotonic() - attempt_start) * 1000
                ai_metrics.record_failure(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="fallback",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    error_class="ProviderUnavailableError",
                    error_message=str(exc),
                    fallback_used=True,
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=0.0)
                span.end()
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
                attempt_lat = (time.monotonic() - attempt_start) * 1000
                ai_metrics.record_failure(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="fallback",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    error_class="SchemaValidationError",
                    error_message=str(exc),
                    fallback_used=True,
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=0.0)
                span.end()
                logger.warning("Route %s schema validation failed: %s; failing over", route_id, exc)
                await circuit_breaker.record_failure(route_id, reason="schema validation")
                fallback_reasons.append(f"{route_id}: schema invalid")
                continue

            except Exception as exc:
                attempt_lat = (time.monotonic() - attempt_start) * 1000
                ai_metrics.record_failure(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="fallback",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    error_class=type(exc).__name__,
                    error_message=str(exc),
                    fallback_used=True,
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=0.0)
                span.end()
                logger.warning("Route %s failed with unexpected error: %s; failing over", route_id, exc)
                await circuit_breaker.record_failure(route_id, reason=str(exc))
                fallback_reasons.append(f"{route_id}: {type(exc).__name__}")
                continue

        # All routes exhausted in chain
        detail_msg = f"All AI routes exhausted for task '{task_profile_name}'. Attempts: {fallback_reasons}"
        logger.error(detail_msg)
        tracer.flush()
        raise AICapacityExhausted(
            message="AI capacity reached or routes temporarily unavailable. Please edit manually or retry shortly.",
            retry_after_seconds=30,
        )

    async def execute_text(self, task_profile_name: str, req: TextRequest) -> TextResult:
        profiles = get_task_profiles()
        profile = profiles.get(task_profile_name) or profiles.get("extract_json") or (next(iter(profiles.values())) if profiles else None)
        if not profile:
            raise AICapacityExhausted("No task profile configured.", retry_after_seconds=30)

        # 0. Data Classification (Rule R9)
        effective_data_class = classify_data(
            prompt=req.prompt,
            system=req.system,
            task_type=task_profile_name,
            explicit_class=req.data_class,
        )

        request_id = f"req_{uuid.uuid4().hex[:12]}"
        trace = tracer.start_trace(
            name=f"ai:{task_profile_name}",
            org_id=req.org_id,
            data_class=str(effective_data_class),
        )

        start_time = time.monotonic()
        total_deadline = min(req.timeout_seconds, profile.max_total_timeout_seconds)
        fallback_reasons = []

        for candidate in profile.chain:
            elapsed = time.monotonic() - start_time
            remaining_budget = total_deadline - elapsed
            if remaining_budget <= 0.5:
                break

            route_id = f"{candidate.provider}:{candidate.model}"

            # Gate A: Privacy class check (Rule R9)
            if effective_data_class == DataClassification.CONFIDENTIAL and candidate.provider not in ("ollama", "mock"):
                logger.debug("Skipping route %s: confidential data cannot leave local perimeter", route_id)
                fallback_reasons.append(f"{route_id}: confidential privacy boundary")
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
            attempt_start = time.monotonic()
            ai_metrics.record_attempt(route_id)
            span = tracer.record_attempt_span(
                trace,
                span_name=route_id,
                provider=candidate.provider,
                model=candidate.model,
                data_class=str(effective_data_class),
                prompt=req.prompt,
            )

            # Privacy & Safety Transformations
            combined_pii_map = {}
            if candidate.provider not in ("ollama", "mock"):
                red_p, pii_p = self.pii_redactor.redact(req.prompt)
                red_s, pii_s = self.pii_redactor.redact(req.system)
                combined_pii_map = {**pii_p, **pii_s}
                safe_prompt = PromptInjectionGuard.delimit_user_input(red_p)
                safe_system = PromptInjectionGuard.harden_system_prompt(red_s)
            else:
                safe_prompt = PromptInjectionGuard.delimit_user_input(req.prompt)
                safe_system = PromptInjectionGuard.harden_system_prompt(req.system)

            attempt_req.prompt = safe_prompt
            attempt_req.system = safe_system
            attempt_req.model = candidate.model
            attempt_req.temperature = candidate.temperature
            attempt_req.max_tokens = candidate.max_tokens
            attempt_req.timeout_seconds = attempt_timeout

            try:
                result = await provider_instance.generate_text(attempt_req)
                attempt_lat = (time.monotonic() - attempt_start) * 1000

                # Lossless PII restoration
                if combined_pii_map:
                    result.text = self.pii_redactor.restore(result.text, combined_pii_map)
                    result.raw_text = self.pii_redactor.restore(result.raw_text, combined_pii_map)

                await circuit_breaker.record_success(route_id)
                await quota_ledger.record_usage(
                    candidate.provider,
                    candidate.model,
                    input_tokens=result.input_tokens or 0,
                    output_tokens=result.output_tokens or 0,
                )
                ai_metrics.record_success(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="success",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    tokens_in=result.input_tokens,
                    tokens_out=result.output_tokens,
                    fallback_used=bool(fallback_reasons),
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=1.0)
                span.score(name="fallback_used", value=1.0 if fallback_reasons else 0.0)
                span.end()

                if fallback_reasons:
                    result.fallback_reason = " -> ".join(fallback_reasons)
                tracer.flush()
                return result
            except Exception as exc:
                attempt_lat = (time.monotonic() - attempt_start) * 1000
                ai_metrics.record_failure(route_id, attempt_lat)
                log_ai_attempt(
                    request_id=request_id,
                    task_type=task_profile_name,
                    provider=candidate.provider,
                    model=candidate.model,
                    status="fallback",
                    latency_ms=attempt_lat,
                    org_id=req.org_id,
                    error_class=type(exc).__name__,
                    error_message=str(exc),
                    fallback_used=True,
                    data_class=str(effective_data_class),
                )
                span.score(name="schema_valid", value=0.0)
                span.end()
                await circuit_breaker.record_failure(route_id, reason=str(exc))
                fallback_reasons.append(f"{route_id}: {type(exc).__name__}")
                continue

        tracer.flush()
        raise AICapacityExhausted(
            message="AI capacity reached or routes temporarily unavailable. Please edit manually or retry shortly.",
            retry_after_seconds=30,
        )


ai_router = AIRouter()
