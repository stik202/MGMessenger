from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MG Messenger API"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = "postgresql+asyncpg://mg:mg@db:5432/mgmessenger"
    upload_dir: str = "./uploads"
    upload_base_url: str = "http://localhost:8000/uploads"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"


settings = Settings()

