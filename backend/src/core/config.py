from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Settings
    APP_NAME: str = "InfraWatch"
    VERSION: str = "0.1.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Database (пока без БД для минимальной версии)
    DATABASE_URL: str = "postgresql://user:pass@localhost:5432/dbname"
    
    class Config:
        env_file = ".env"

settings = Settings()