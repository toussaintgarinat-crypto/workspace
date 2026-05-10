import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GATEWAY_URL: str = "http://localhost:4000"
    GATEWAY_API_KEY: str = "sk-assistant"
    GATEWAY_MODEL: str = "openai/gpt-4o"
    DB_PATH: str = "/data/assistant.db" if os.path.isdir("/data") else "./assistant.db"
    CORS_ORIGINS: str = "http://localhost:8300,http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
