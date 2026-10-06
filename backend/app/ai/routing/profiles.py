"""
Task Profiles and Failover Chains for OpsPilot AI Gateway.
Section 4.3: Ordered provider chains, temperature limits, timeout budgets per task.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from app.ai.config import ai_settings


@dataclass
class RouteCandidate:
    provider: str
    model: str
    timeout_seconds: float = 10.0
    temperature: float = 0.2
    max_tokens: int = 1024
    supports_json: bool = True
    supports_vision: bool = False


@dataclass
class TaskProfile:
    name: str
    chain: List[RouteCandidate]
    max_total_timeout_seconds: float = 25.0
    cache_ttl_seconds: int = 3600
    allowed_data_classes: List[str] = field(default_factory=lambda: ["public_demo", "internal"])


def get_task_profiles() -> Dict[str, TaskProfile]:
    """Returns task profile registry with ordered failover chains."""
    # When MOCK_AI_PROVIDER is active, mock leads every chain
    mock_candidate = RouteCandidate(
        provider="mock",
        model="mock-v1",
        timeout_seconds=2.0,
        temperature=0.2,
        max_tokens=2048,
    )

    profiles = {
        # Lead-to-Proposal agent: temperature <= 0.3, line items only
        "quote_draft": TaskProfile(
            name="quote_draft",
            chain=[
                RouteCandidate("groq", "openai/gpt-oss-120b", timeout_seconds=8.0, temperature=0.2, max_tokens=2048),
                RouteCandidate("gemini", "gemma-4-26b-a4b-it", timeout_seconds=10.0, temperature=0.2, max_tokens=2048),
                RouteCandidate("groq", "openai/gpt-oss-20b", timeout_seconds=6.0, temperature=0.2, max_tokens=1536),
                RouteCandidate("cloudflare", "@cf/meta/llama-3.1-8b-instruct", timeout_seconds=8.0, temperature=0.2, max_tokens=1536),
                RouteCandidate("openrouter", "apodex/apodex-1.1-mini:free", timeout_seconds=8.0, temperature=0.2, max_tokens=1536),
                RouteCandidate("mistral", "mistral-small-latest", timeout_seconds=8.0, temperature=0.2, max_tokens=1536),
                RouteCandidate("ollama", ai_settings.OLLAMA_FAST_MODEL, timeout_seconds=15.0, temperature=0.2, max_tokens=1536),
            ],
            max_total_timeout_seconds=ai_settings.AI_TOTAL_DEADLINE_SECONDS,
            cache_ttl_seconds=1800,
            allowed_data_classes=["public_demo", "internal"],
        ),

        # Parsing, repair, small structured jobs
        "extract_json": TaskProfile(
            name="extract_json",
            chain=[
                RouteCandidate("groq", "openai/gpt-oss-20b", timeout_seconds=5.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("cloudflare", "@cf/meta/llama-3.1-8b-instruct", timeout_seconds=6.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("gemini", "gemma-4-26b-a4b-it", timeout_seconds=8.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("openrouter", "apodex/apodex-1.1-mini:free", timeout_seconds=6.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("mistral", "mistral-small-latest", timeout_seconds=6.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("ollama", ai_settings.OLLAMA_FAST_MODEL, timeout_seconds=10.0, temperature=0.1, max_tokens=512),
            ],
            max_total_timeout_seconds=20.0,
            cache_ttl_seconds=7200,
            allowed_data_classes=["public_demo", "internal"],
        ),

        # Documents & RAG synthesis
        "rag_answer": TaskProfile(
            name="rag_answer",
            chain=[
                RouteCandidate("groq", "openai/gpt-oss-120b", timeout_seconds=7.0, temperature=0.2, max_tokens=1024),
                RouteCandidate("gemini", "gemma-4-26b-a4b-it", timeout_seconds=8.0, temperature=0.2, max_tokens=1024),
                RouteCandidate("cloudflare", "@cf/meta/llama-3.1-8b-instruct", timeout_seconds=7.0, temperature=0.2, max_tokens=1024),
                RouteCandidate("openrouter", "apodex/apodex-1.1-mini:free", timeout_seconds=8.0, temperature=0.2, max_tokens=1024),
                RouteCandidate("mistral", "mistral-small-latest", timeout_seconds=8.0, temperature=0.2, max_tokens=1024),
                RouteCandidate("ollama", ai_settings.OLLAMA_FAST_MODEL, timeout_seconds=12.0, temperature=0.2, max_tokens=1024),
            ],
            max_total_timeout_seconds=ai_settings.AI_TOTAL_DEADLINE_SECONDS,
            cache_ttl_seconds=3600,
            allowed_data_classes=["public_demo", "internal"],
        ),

        # Month-end billing anomaly explanations
        "billing_explain": TaskProfile(
            name="billing_explain",
            chain=[
                RouteCandidate("groq", "llama-3.1-8b-instant", timeout_seconds=6.0, temperature=0.2, max_tokens=512),
                RouteCandidate("gemini", "gemini-2.0-flash", timeout_seconds=8.0, temperature=0.2, max_tokens=512),
                RouteCandidate("mistral", "mistral-small-latest", timeout_seconds=6.0, temperature=0.2, max_tokens=512),
                RouteCandidate("ollama", ai_settings.OLLAMA_FAST_MODEL, timeout_seconds=10.0, temperature=0.2, max_tokens=512),
            ],
            max_total_timeout_seconds=20.0,
            cache_ttl_seconds=86400,
            allowed_data_classes=["public_demo", "internal"],
        ),

        # Migration column mapping
        "mapping_suggest": TaskProfile(
            name="mapping_suggest",
            chain=[
                RouteCandidate("gemini", "gemini-2.0-flash", timeout_seconds=7.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("groq", "llama-3.1-8b-instant", timeout_seconds=6.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("mistral", "mistral-small-latest", timeout_seconds=6.0, temperature=0.1, max_tokens=1024),
            ],
            max_total_timeout_seconds=20.0,
            cache_ttl_seconds=86400,
            allowed_data_classes=["public_demo", "internal"],
        ),

        # Reviewer second pass
        "reviewer": TaskProfile(
            name="reviewer",
            chain=[
                RouteCandidate("groq", ai_settings.AI_ALIAS_QUOTE_FAST, timeout_seconds=7.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("gemini", "gemini-2.0-flash", timeout_seconds=8.0, temperature=0.1, max_tokens=1024),
                RouteCandidate("mistral", "mistral-small-latest", timeout_seconds=7.0, temperature=0.1, max_tokens=1024),
            ],
            max_total_timeout_seconds=20.0,
            cache_ttl_seconds=1800,
            allowed_data_classes=["public_demo", "internal"],
        ),

        # Private / confidential data class route (never leaves machine)
        "private": TaskProfile(
            name="private",
            chain=[
                RouteCandidate("ollama", ai_settings.OLLAMA_FAST_MODEL, timeout_seconds=20.0, temperature=0.2, max_tokens=1024),
            ],
            max_total_timeout_seconds=25.0,
            cache_ttl_seconds=0,
            allowed_data_classes=["confidential"],
        ),
    }

    # If mock provider mode is enabled in settings or test environment, insert mock at head
    if ai_settings.MOCK_AI_PROVIDER:
        for profile in profiles.values():
            profile.chain.insert(0, mock_candidate)

    return profiles
