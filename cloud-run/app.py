"""Cloud Run entry point for once-per-minute collection."""

from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify

from config import Settings, is_market_collection_time
from kis_client import KisClient, transform_minute_rows
from storage import SupabaseStorage


app = Flask(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("collector")


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "market-data-collector"})


@app.post("/collect")
def collect():
    run_id = str(uuid.uuid4())
    started = time.monotonic()
    now = datetime.now(timezone.utc)

    try:
        settings = Settings.from_env()
    except ValueError as exc:
        logger.error("configuration_error run_id=%s error=%s", run_id, exc)
        return jsonify({"ok": False, "run_id": run_id, "error": str(exc)}), 500

    storage = SupabaseStorage(
        settings.supabase_url,
        settings.supabase_service_role_key,
        settings.request_timeout_seconds,
    )

    if not settings.force_collection and not is_market_collection_time(now):
        result = {
            "run_id": run_id,
            "started_at": now.isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": "skipped_market_closed",
            "symbols_requested": len(settings.symbols),
            "candles_written": 0,
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
        storage.record_run(result)
        return jsonify({"ok": True, **result})

    client = KisClient(
        settings.kis_app_key,
        settings.kis_app_secret,
        settings.kis_base_url,
        storage,
        settings.market_code,
        settings.request_timeout_seconds,
    )
    candles_written = 0
    errors: list[dict[str, str]] = []

    for symbol in settings.symbols:
        try:
            raw_rows = client.minute_rows(symbol, now)
            candles = transform_minute_rows(
                symbol,
                raw_rows,
                completed_before=now,
                public_visible=settings.public_live_data_enabled,
            )
            candles_written += storage.upsert_candles(candles)
        except Exception as exc:  # Log per-symbol failure and continue remaining symbols.
            logger.exception("symbol_collection_failed run_id=%s symbol=%s", run_id, symbol)
            errors.append({"symbol": symbol, "error": str(exc)[:300]})

    finished = datetime.now(timezone.utc)
    status = "success" if not errors else "partial_failure"
    result = {
        "run_id": run_id,
        "started_at": now.isoformat(),
        "finished_at": finished.isoformat(),
        "status": status,
        "symbols_requested": len(settings.symbols),
        "candles_written": candles_written,
        "duration_ms": round((time.monotonic() - started) * 1000),
        "error_summary": errors or None,
    }
    try:
        storage.record_run(result)
    except Exception:
        logger.exception("run_log_failed run_id=%s", run_id)

    response_code = 200 if not errors else 502
    return jsonify({"ok": not errors, **result}), response_code


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
