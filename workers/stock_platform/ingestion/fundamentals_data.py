from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request


def read_fundamentals_json(path: str | os.PathLike[str]) -> list[dict[str, object]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))

    if isinstance(payload, dict):
        records = payload.get("records", [])
    else:
        records = payload

    if not isinstance(records, list):
        raise ValueError("Fundamentals input must be a list or an object with a 'records' list.")

    normalized: list[dict[str, object]] = []
    for item in records:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        normalized.append(
            {
                **item,
                "symbol": symbol,
                "exchange": str(item.get("exchange", "NSE")).strip().upper() or "NSE",
            }
        )

    return normalized


def build_fundamentals_payload(
    records: list[dict[str, object]],
    *,
    adapter_key: str,
    adapter_label: str,
    exchange: str,
    source_type: str = "official",
    detail: str | None = None,
) -> dict[str, object]:
    timestamp = datetime.now(timezone.utc).isoformat()
    return {
        "source": {
            "adapterKey": adapter_key,
            "adapterLabel": adapter_label,
            "sourceType": source_type,
            "freshnessExpectation": "Quarterly / filing-driven",
            "exchange": exchange.upper(),
            "startedAt": timestamp,
            "finishedAt": timestamp,
            "status": "healthy",
            "detail": detail or f"Fundamentals refresh completed for {exchange.upper()}.",
        },
        "records": records,
    }


def push_fundamentals_payload(payload: dict[str, object]) -> dict[str, object]:
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

    rpc_url = supabase_url.rstrip("/") + "/rest/v1/rpc/app_ingest_fundamentals_payload"
    body = json.dumps({"payload": payload}).encode("utf-8")
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }

    req = request.Request(rpc_url, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=60) as response:
            data = response.read().decode("utf-8")
            return json.loads(data) if data else {}
    except error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase RPC failed: {exc.code} {message}") from exc
