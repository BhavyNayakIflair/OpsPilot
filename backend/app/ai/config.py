"""Typed configuration for the OpsPilot AI Gateway."""
from pathlib import Path
from typing import Any, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AISettings(BaseSettings):
    """
    Configuration for AI Gateway.
    Rule R3: Hard budget $0.00 forever.
    Missing keys mean that provider is unconfigured and gracefully skipped.
    """
    AI_ENABLED: bool = True
    AI_DEMO_MODE: bool = False
    AI_DEFAULT_DATA_CLASS: str = "internal"  # public_demo | internal | confidential
    AI_TOTAL_DEADLINE_SECONDS: float = 25.0
    AI_MAX_CALLS_PER_AGENT_RUN: int = 6
    AI_QUOTA_HEADROOM_PERCENT: int = 15

    # Providers API keys (all free tier, no card)
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    CF_ACCOUNT_ID: Optional[str] = None
    CF_API_TOKEN: Optional[str] = None
    MISTRAL_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None

    # Model Aliases (resolved against provider defaults if empty)
    AI_ALIAS_QUOTE_QUALITY: str = "gemini-2.0-flash"
    AI_ALIAS_QUOTE_FAST: str = "llama-3.3-70b-versatile"
    AI_ALIAS_EXTRACT: str = "llama-3.1-8b-instant"
    AI_ALIAS_RAG: str = "llama-3.1-8b-instant"
    AI_ALIAS_EMBED: str = "text-embedding-004"

    # Observability
    LANGFUSE_PUBLIC_KEY: Optional[str] = None
    LANGFUSE_SECRET_KEY: Optional[str] = None
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # Optional Feature Flags & Storage
    QDRANT_URL: Optional[str] = None
    QDRANT_API_KEY: Optional[str] = None
    FEATURE_VECTOR_QDRANT: bool = False
    FEATURE_STT: bool = False

    # Ollama Local Settings (legacy & confidential fallback)
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_CHAT_MODEL: str = "qwen3:4b"
    OLLAMA_FAST_MODEL: str = "qwen2.5:3b-instruct"
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"
    OLLAMA_TIMEOUT_SECONDS: float = 120.0
    OLLAMA_QUOTE_TIMEOUT_SECONDS: float = 300.0

    # Fallback and Mock Controls
    MOCK_AI_PROVIDER: bool = False
    LLM_PROVIDER: str = "ollama"
    DEFAULT_MONTHLY_AI_BUDGET_USD: float = 0.0

    @field_validator("DEFAULT_MONTHLY_AI_BUDGET_USD", mode="before")
    @classmethod
    def enforce_zero_budget(cls, v: Any) -> float:
        # Rule R3: Hard budget $0.00 forever.
        return 0.0

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        case_sensitive=True,
        extra="ignore",
    )


ai_settings = AISettings()
