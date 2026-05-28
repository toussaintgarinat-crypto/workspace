import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GATEWAY_URL: str = "http://localhost:4000"
    GATEWAY_API_KEY: str = "sk-assistant"
    GATEWAY_MASTER_KEY: str = ""  # Required in production — no default to avoid leaking admin access
    GATEWAY_MODEL: str = "openai/gpt-4o"
    FALLBACK_MODELS: str = ""  # Comma-separated gateway model strings tried in order on 429/5xx/timeout (e.g. openai/gpt-4o-mini,ollama/llama3.2)
    DB_PATH: str = "/data/assistant.db" if os.path.isdir("/data") else "./assistant.db"
    DATABASE_URL: str = ""  # If set, overrides DB_PATH and uses PostgreSQL via asyncpg
    CORS_ORIGINS: str = "http://localhost:8300,http://localhost:3000"
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "forge"
    KEYCLOAK_CLIENT_ID: str = "assistant-app"
    KEYCLOAK_AUDIENCE: str = ""  # Multi-tenant: valeur = client_id Keycloak (ex: assistant-app). Vide = verify_aud désactivé.
    AUTH_ENABLED: bool = False
    VAULT_SECRET: str = ""  # Required — set a random 32+ char secret; empty default forces explicit config
    SWARM_MAX_WORKERS: int = 3
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    DISCORD_WEBHOOK_URL: str = ""
    VAPID_SUBJECT: str = "assistant@localhost"
    REDIS_URL: str = ""  # redis://redis:6379 — enables pub/sub SSE + scheduler leader election

    # RAG — automatic MemPalace context injection
    RAG_ENABLED: bool = True
    RAG_TOP_K: int = 5
    RAG_MIN_SCORE: float = 0.7

    # Conversation summarizer
    SUMMARIZE_ENABLED: bool = True
    SUMMARIZE_THRESHOLD: int = 20

    # Local voice (faster-whisper + Kokoro)
    LOCAL_VOICE_ENABLED: bool = False
    KOKORO_VOICE: str = "af_heart"

    # Kiwix offline knowledge base (Wikipedia LAN)
    KIWIX_URL: str = ""  # http://kiwix:8080 — vide = désactivé

    # Calendar service (S106e)
    CALENDAR_URL: str = ""  # http://calendar:8400 — vide = désactivé
    CALENDAR_SERVICE_TOKEN: str = ""

    # ToolHub service (S117+)
    TOOLHUB_URL: str = ""  # http://toolhub:8500 — vide = désactivé
    TOOLHUB_SERVICE_TOKEN: str = ""

    # Daily chat quota per user (0 = unlimited)
    QUOTA_FREE_DAILY: int = 50
    QUOTA_PREMIUM_DAILY: int = 500
    QUOTA_PREMIUM_ROLE: str = "premium"  # Keycloak realm role that grants premium quota

    # OCR provider for scanned PDFs (doc_intelligence)
    # mistral = Mistral OCR API (recommended, handles PDF natively)
    # llm     = vision via gateway model (any multimodal model, page-by-page)
    # tesseract = local Tesseract (no API key needed)
    OCR_PROVIDER: str = "tesseract"
    MISTRAL_API_KEY: str = ""

    # Degraded mode webhook token (S90) — partagé avec Alertmanager
    DEGRADED_WEBHOOK_TOKEN: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
