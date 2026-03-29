from __future__ import annotations

import csv
import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib import error, request

from stock_platform.models import EodMarketRecord

FIELD_ALIASES = {
    "symbol": ("symbol", "ticker", "security code", "security_code", "tradingsymbol"),
    "exchange": ("exchange",),
    "price_date": ("date", "price date", "timestamp"),
    "open": ("open", "open price"),
    "high": ("high", "high price"),
    "low": ("low", "low price"),
    "close": ("close", "close price", "ltp"),
    "volume": ("volume", "total traded quantity", "traded qty", "tottrdqty"),
}


def _normalize_header(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").split())


def _lookup(row: dict[str, str], *aliases: str) -> str | None:
    for alias in aliases:
        normalized = _normalize_header(alias)
        if normalized in row and row[normalized].strip():
            return row[normalized].strip()
    return None


def _parse_float(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    return float(value.replace(",", ""))


def _parse_int(value: str | None) -> int | None:
    if value is None or not value.strip():
        return None
    return int(float(value.replace(",", "")))


def _normalize_date(value: str | None, fallback: str | None = None) -> str | None:
    if value and value.strip():
        raw = value.strip()
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(raw, fmt).date().isoformat()
            except ValueError:
                continue
    return fallback


def read_eod_market_csv(path: str | os.PathLike[str], source_exchange: str, price_date: str | None = None) -> list[EodMarketRecord]:
    csv_path = Path(path)
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        records: list[EodMarketRecord] = []
        for raw_row in reader:
            row = {_normalize_header(key): (value or "") for key, value in raw_row.items() if key}
            symbol = _lookup(row, *FIELD_ALIASES["symbol"])
            open_price = _parse_float(_lookup(row, *FIELD_ALIASES["open"]))
            high_price = _parse_float(_lookup(row, *FIELD_ALIASES["high"]))
            low_price = _parse_float(_lookup(row, *FIELD_ALIASES["low"]))
            close_price = _parse_float(_lookup(row, *FIELD_ALIASES["close"]))
            volume = _parse_int(_lookup(row, *FIELD_ALIASES["volume"]))
            normalized_date = _normalize_date(_lookup(row, *FIELD_ALIASES["price_date"]), fallback=price_date)

            if not symbol or normalized_date is None or None in {open_price, high_price, low_price, close_price, volume}:
                continue

            records.append(
                EodMarketRecord(
                    symbol=symbol.upper(),
                    exchange=(_lookup(row, *FIELD_ALIASES["exchange"]) or source_exchange).upper(),
                    price_date=normalized_date,
                    open=float(open_price),
                    high=float(high_price),
                    low=float(low_price),
                    close=float(close_price),
                    volume=int(volume),
                )
            )
        return records


def build_eod_market_payload(
    records: Iterable[EodMarketRecord],
    *,
    adapter_key: str,
    adapter_label: str,
    exchange: str,
    source_type: str = "official",
    detail: str | None = None,
) -> dict[str, object]:
    timestamp = datetime.now(timezone.utc).isoformat()
    serialized_records = []
    for record in records:
        item = asdict(record)
        item["priceDate"] = item.pop("price_date")
        serialized_records.append(item)

    return {
        "source": {
            "adapterKey": adapter_key,
            "adapterLabel": adapter_label,
            "sourceType": source_type,
            "freshnessExpectation": "Daily after market close",
            "exchange": exchange.upper(),
            "startedAt": timestamp,
            "finishedAt": timestamp,
            "status": "healthy",
            "detail": detail or f"EOD market-data refresh completed for {exchange.upper()}.",
        },
        "records": serialized_records,
    }


def push_eod_market_payload(payload: dict[str, object]) -> dict[str, object]:
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

    rpc_url = supabase_url.rstrip("/") + "/rest/v1/rpc/app_ingest_eod_market_data"
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

