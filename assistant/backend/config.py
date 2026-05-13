import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GATEWAY_URL: str = "http://localhost:4000"
    GATEWAY_API_KEY: str = "sk-assistant"
    GATEWAY_MASTER_KEY: str = "sk-master-change-this"
    GATEWAY_MODEL: str = "openai/gpt-4o"
    DB_PATH: str = "/data/assistant.db" if os.path.isdir("/data") else "./assistant.db"
    CORS_ORIGINS: str = "http://localhost:8300,http://localhost:3000"
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "forge"
    AUTH_ENABLED: bool = False
    VAULT_SECRET: str = "change_this_vault_secret_in_production_32chars"
    SWARM_MAX_WORKERS: int = 3

    class Config:
        env_file = ".env"


settings = Settings()
