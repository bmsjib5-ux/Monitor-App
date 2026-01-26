from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Application settings
    app_name: str = "Windows Application Monitor"
    app_version: str = "4.0.50"

    # Server settings
    host: str = "0.0.0.0"
    port: int = 3001

    # Monitoring settings
    update_interval: int = 2  # seconds
    history_length: int = 60  # keep last 60 data points

    # Resource thresholds
    cpu_threshold: float = 80.0  # percentage
    ram_threshold: float = 80.0  # percentage
    disk_io_threshold: float = 100.0  # MB/s
    network_threshold: float = 50.0  # MB/s

    # Logging
    log_file: str = "logs/monitor.log"
    log_level: str = "INFO"

    # CORS
    cors_origins: list = ["http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:3001", "http://127.0.0.1:3000"]

    # MySQL Database settings
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "sa"
    db_password: str = "sa"
    db_name: str = "monitor_app"

    # Supabase settings (REST API)
    supabase_url: str = "https://ktkklfpncuhvduxxumhb.supabase.co"
    supabase_key: str = "sb_publishable_5O2X0d0UEweFyrQA5dQ74w_VV5FbiXU"
    use_supabase: bool = True  # Set to True to use Supabase instead of direct PostgreSQL

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
