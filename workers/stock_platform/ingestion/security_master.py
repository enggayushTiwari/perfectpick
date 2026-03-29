from __future__ import annotations

import csv
import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib import error, request

from stock_platform.models import SecurityMasterRecord

FIELD_ALIASES = {
    "symbol": ("symbol", "ticker", "security code", "security_code", "nse symbol", "bse symbol", "tradingsymbol"),
    "display_name": ("company name", "name of company", "issuer name", "display name", "company"),
    "legal_name": ("legal name", "company legal name"),
    "isin": ("isin", "isin number", "isin no"),
    "sector": ("sector", "industry group", "sector name"),
    "industry": ("industry", "industry name", "sub industry"),
    "website_url": ("website", "website url", "company website"),
    "ir_url": ("ir url", "investor relations", "investor relations url"),
    "business_summary": ("business summary", "description", "company description"),
    "exchange": ("exchange",),
}


def _normalize_header(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").split())


def _lookup(row: dict[str, str], *aliases: str) -> str | None:
    for alias in aliases:
      normalized = _normalize_header(alias)
      if normalized in row and row[normalized].strip():
          return row[normalized].strip()
    return None


def _parse_bool(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "n"}


def _slugify(value: str) -> str:
    parts = ["".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")]
    return "-".join(filter(None, parts[0].split("-")))


def read_security_master_csv(path: str | os.PathLike[str], source_exchange: str) -> list[SecurityMasterRecord]:
    csv_path = Path(path)
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        records: list[SecurityMasterRecord] = []
        for raw_row in reader:
            row = {_normalize_header(key): (value or "") for key, value in raw_row.items() if key}
            symbol = _lookup(row, *FIELD_ALIASES["symbol"])
            display_name = _lookup(row, *FIELD_ALIASES["display_name"])

            if not symbol or not display_name:
                continue

            records.append(
                SecurityMasterRecord(
                    symbol=symbol.upper(),
                    exchange=(_lookup(row, *FIELD_ALIASES["exchange"]) or source_exchange).upper(),
                    display_name=display_name,
                    legal_name=_lookup(row, *FIELD_ALIASES["legal_name"]) or display_name,
                    isin=_lookup(row, *FIELD_ALIASES["isin"]),
                    sector=_lookup(row, *FIELD_ALIASES["sector"]),
                    industry=_lookup(row, *FIELD_ALIASES["industry"]),
                    business_summary=_lookup(row, *FIELD_ALIASES["business_summary"]),
                    website_url=_lookup(row, *FIELD_ALIASES["website_url"]),
                    ir_url=_lookup(row, *FIELD_ALIASES["ir_url"]),
                    is_primary=_parse_bool(row.get("is primary")),
                )
            )
        return records


def build_security_master_payload(
    records: Iterable[SecurityMasterRecord],
    *,
    adapter_key: str,
    adapter_label: str,
    source_type: str = "official",
    exchange: str,
    detail: str | None = None,
) -> dict[str, object]:
    timestamp = datetime.now(timezone.utc).isoformat()
    serialized_records = []
    for record in records:
        item = asdict(record)
        item["sectorSlug"] = _slugify(record.sector) if record.sector else None
        item["industrySlug"] = _slugify(record.industry) if record.industry else None
        item["slug"] = _slugify(record.display_name)
        item["displayName"] = item.pop("display_name")
        item["legalName"] = item.pop("legal_name")
        item["businessSummary"] = item.pop("business_summary")
        item["websiteUrl"] = item.pop("website_url")
        item["irUrl"] = item.pop("ir_url")
        item["isPrimary"] = item.pop("is_primary")
        serialized_records.append(item)

    return {
        "source": {
            "adapterKey": adapter_key,
            "adapterLabel": adapter_label,
            "sourceType": source_type,
            "freshnessExpectation": "Daily directory refresh",
            "exchange": exchange.upper(),
            "startedAt": timestamp,
            "finishedAt": timestamp,
            "status": "healthy",
            "detail": detail or f"Security master refresh completed for {exchange.upper()}."
        },
        "records": serialized_records,
    }


def push_security_master_payload(payload: dict[str, object]) -> dict[str, object]:
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

    rpc_url = supabase_url.rstrip("/") + "/rest/v1/rpc/app_refresh_security_master"
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

