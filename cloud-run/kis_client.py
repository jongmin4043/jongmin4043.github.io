"""Korea Investment & Securities Open API client and minute-bar parser."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from storage import SupabaseStorage


SEOUL = ZoneInfo("Asia/Seoul")
TOKEN_STATE_KEY = "kis_access_token"


def _decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError(f"Invalid numeric value: {value!r}") from exc


def transform_minute_rows(
    symbol: str,
    rows: list[dict[str, Any]],
    completed_before: datetime,
    public_visible: bool,
) -> list[dict[str, Any]]:
    """Convert KIS output2 rows to validated, completed UTC candles."""
    cutoff = completed_before.astimezone(SEOUL).replace(second=0, microsecond=0)
    transformed: list[dict[str, Any]] = []

    for row in rows:
        date_value = str(row.get("stck_bsop_date", ""))
        time_value = str(row.get("stck_cntg_hour", "")).zfill(6)
        try:
            bar_time = datetime.strptime(
                f"{date_value}{time_value}", "%Y%m%d%H%M%S"
            ).replace(tzinfo=SEOUL)
            open_price = _decimal(row.get("stck_oprc"))
            high_price = _decimal(row.get("stck_hgpr"))
            low_price = _decimal(row.get("stck_lwpr"))
            close_price = _decimal(row.get("stck_prpr"))
            volume = int(_decimal(row.get("cntg_vol", 0)))
        except (ValueError, TypeError):
            continue

        if bar_time >= cutoff:
            continue
        if min(open_price, high_price, low_price, close_price) <= 0 or volume < 0:
            continue
        if high_price < max(open_price, close_price, low_price):
            continue
        if low_price > min(open_price, close_price, high_price):
            continue

        transformed.append(
            {
                "symbol": symbol,
                "bar_time": bar_time.astimezone(timezone.utc).isoformat(),
                "open": str(open_price),
                "high": str(high_price),
                "low": str(low_price),
                "close": str(close_price),
                "volume": volume,
                "is_complete": True,
                "public_visible": public_visible,
                "source": "kis_openapi",
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    return sorted(transformed, key=lambda candle: candle["bar_time"])


class KisClient:
    def __init__(
        self,
        app_key: str,
        app_secret: str,
        base_url: str,
        storage: "SupabaseStorage",
        market_code: str = "J",
        timeout: int = 8,
    ) -> None:
        self._app_key = app_key
        self._app_secret = app_secret
        self._base_url = base_url
        self._storage = storage
        self._market_code = market_code
        self._timeout = timeout

    def _cached_token(self) -> str | None:
        state = self._storage.get_runtime_state(TOKEN_STATE_KEY)
        if not state or not state.get("expires_at"):
            return None
        try:
            expires_at = datetime.fromisoformat(
                str(state["expires_at"]).replace("Z", "+00:00")
            )
        except ValueError:
            return None
        if expires_at <= datetime.now(timezone.utc) + timedelta(minutes=5):
            return None
        value = state.get("state_value") or {}
        return value.get("access_token") if isinstance(value, dict) else None

    def access_token(self) -> str:
        import requests

        cached = self._cached_token()
        if cached:
            return cached

        response = requests.post(
            f"{self._base_url}/oauth2/tokenP",
            json={
                "grant_type": "client_credentials",
                "appkey": self._app_key,
                "appsecret": self._app_secret,
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("access_token")
        if not token:
            raise RuntimeError("KIS token response did not include access_token")

        try:
            lifetime = int(payload.get("expires_in", 86_400))
        except (TypeError, ValueError):
            lifetime = 86_400
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(600, lifetime))
        self._storage.set_runtime_state(
            TOKEN_STATE_KEY,
            {"access_token": token},
            expires_at.isoformat(),
        )
        return token

    def minute_rows(self, symbol: str, at: datetime) -> list[dict[str, Any]]:
        import requests

        seoul_time = at.astimezone(SEOUL)
        response = requests.get(
            f"{self._base_url}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
            headers={
                "content-type": "application/json; charset=utf-8",
                "authorization": f"Bearer {self.access_token()}",
                "appkey": self._app_key,
                "appsecret": self._app_secret,
                "tr_id": "FHKST03010200",
                "custtype": "P",
            },
            params={
                "FID_ETC_CLS_CODE": "",
                "FID_COND_MRKT_DIV_CODE": self._market_code,
                "FID_INPUT_ISCD": symbol,
                "FID_INPUT_HOUR_1": seoul_time.strftime("%H%M%S"),
                "FID_PW_DATA_INCU_YN": "Y",
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if str(payload.get("rt_cd", "0")) != "0":
            raise RuntimeError(
                f"KIS API error {payload.get('msg_cd', 'unknown')}: "
                f"{payload.get('msg1', 'request failed')}"
            )
        rows = payload.get("output2", [])
        return rows if isinstance(rows, list) else []
