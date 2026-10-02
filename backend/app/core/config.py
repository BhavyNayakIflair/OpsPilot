from typing import List, Union
from pathlib import Path
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "OpsPilot"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = "opspilot-super-secure-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Database: Supports async PostgreSQL or async SQLite (for fast in-memory/isolated tests)
    DATABASE_URL: str = "sqlite+aiosqlite:///./opspilot.db"
    
    # Redis for caching, arq background worker, and pub/sub
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Object storage (MinIO locally / S3)
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "opspilot-docs"
    
    # AI settings
    MOCK_AI_PROVIDER: bool = True
    LLM_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_CHAT_MODEL: str = "qwen3:4b"
    OLLAMA_FAST_MODEL: str = "qwen2.5:3b-instruct"
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"
    OLLAMA_TIMEOUT_SECONDS: float = 120.0
    OLLAMA_QUOTE_TIMEOUT_SECONDS: float = 300.0
    OPENAI_API_KEY: str = ""
    DEFAULT_FAST_MODEL: str = "qwen2.5:3b-instruct"
    DEFAULT_REASONING_MODEL: str = "qwen3:4b"
    DEFAULT_REVIEW_MODEL: str = "qwen2.5:3b-instruct"
    DEFAULT_EMBEDDING_MODEL: str = "nomic-embed-text"
    DEFAULT_MONTHLY_AI_BUDGET_USD: float = 0.0
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        # Resolve the repository-root .env even when Alembic or Uvicorn is
        # launched from backend/ rather than the project root.
        env_file=Path(__file__).resolve().parents[3] / ".env",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
