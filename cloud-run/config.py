"""Environment-backed settings for the market-data collector."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo


SEOUL = ZoneInfo("Asia/Seoul")


def is_market_collection_time(now: datetime) -> bool:
    """Return true during the weekday collection window in Seoul."""
    local = now.astimezone(SEOUL)
    if local.weekday() >= 5:
        return False
    minutes = local.hour * 60 + local.minute
    return 9 * 60 <= minutes <= 15 * 60 + 31


def _as_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(name: str, default: int) -> int:
    value = os.getenv(name)
    try:
        return int(value) if value is not None else default
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    kis_app_key: str
    kis_app_secret: str
    kis_base_url: str
    symbols: tuple[str, ...]
    market_code: str
    public_live_data_enabled: bool
    paper_trading_enabled: bool
    force_collection: bool
    request_timeout_seconds: int

    @classmethod
    def from_env(cls) -> "Settings":
        max_symbols = max(1, min(_as_int("MAX_SYMBOLS", 10), 10))
        symbols = tuple(
            dict.fromkeys(
                item.strip()
                for item in os.getenv("SYMBOLS", "005930").split(",")
                if item.strip()
            )
        )[:max_symbols]
        if not symbols:
            raise ValueError("SYMBOLS must contain at least one stock code")

        settings = cls(
            supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
            kis_app_key=os.getenv("KIS_APP_KEY", ""),
            kis_app_secret=os.getenv("KIS_APP_SECRET", ""),
            kis_base_url=os.getenv(
                "KIS_BASE_URL", "https://openapi.koreainvestment.com:9443"
            ).rstrip("/"),
            symbols=symbols,
            market_code=os.getenv("MARKET_CODE", "J"),
            public_live_data_enabled=_as_bool("PUBLIC_LIVE_DATA_ENABLED"),
            paper_trading_enabled=_as_bool("PAPER_TRADING_ENABLED"),
            force_collection=_as_bool("FORCE_COLLECTION"),
            request_timeout_seconds=max(
                3, min(_as_int("REQUEST_TIMEOUT_SECONDS", 8), 30)
            ),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        required = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
            "KIS_APP_KEY": self.kis_app_key,
            "KIS_APP_SECRET": self.kis_app_secret,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        if not self.supabase_url.startswith("https://"):
            raise ValueError("SUPABASE_URL must use HTTPS")
