import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = ""
    DB_PATH: str = "/data/toolhub.db" if os.path.isdir("/data") else "./toolhub.db"
    REDIS_URL: str = ""
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8300"
    AUTH_ENABLED: bool = False
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "forge"
    KEYCLOAK_CLIENT_ID: str = "toolhub-app"
    KEYCLOAK_AUDIENCE: str = ""
    TOOLHUB_SERVICE_TOKEN: str = ""
    TOOLHUB_ENCRYPTION_KEY: str = ""
    TOOLHUB_DEFAULT_CACHE_TTL: int = 60
    TOOLHUB_EXECUTION_LOG_MAX_ROWS: int = 10000
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
