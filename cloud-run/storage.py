"""Minimal Supabase REST storage client.

The service-role key is used only inside Cloud Run. It must never be shipped to the
browser or committed to the repository.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests


class SupabaseStorage:
    def __init__(self, url: str, service_role_key: str, timeout: int = 8) -> None:
        self._rest_url = f"{url}/rest/v1"
        self._timeout = timeout
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        headers = {**self._headers, **kwargs.pop("headers", {})}
        response = requests.request(
            method,
            f"{self._rest_url}/{path}",
            headers=headers,
            timeout=self._timeout,
            **kwargs,
        )
        response.raise_for_status()
        return response

    def get_runtime_state(self, key: str) -> dict[str, Any] | None:
        response = self._request(
            "GET",
            "pipeline_runtime_state",
            params={
                "select": "state_key,state_value,expires_at",
                "state_key": f"eq.{key}",
                "limit": "1",
            },
        )
        rows = response.json()
        return rows[0] if rows else None

    def set_runtime_state(
        self, key: str, value: dict[str, Any], expires_at: str | None = None
    ) -> None:
        self._request(
            "POST",
            "pipeline_runtime_state",
            params={"on_conflict": "state_key"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json={
                "state_key": key,
                "state_value": value,
                "expires_at": expires_at,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def upsert_candles(self, candles: list[dict[str, Any]]) -> int:
        if not candles:
            return 0
        self._request(
            "POST",
            "candles_1m",
            params={"on_conflict": "symbol,bar_time"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=candles,
        )
        return len(candles)

    def record_run(self, run: dict[str, Any]) -> None:
        self._request(
            "POST",
            "pipeline_runs",
            headers={"Prefer": "return=minimal"},
            json=run,
        )

