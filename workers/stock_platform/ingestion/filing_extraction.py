from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _to_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = value.replace(",", "").strip()
        if not normalized:
            return None
        return float(normalized)
    return None


def _to_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_period_row(raw: dict[str, Any], *, period_key: str) -> dict[str, object]:
    period = _to_text(raw.get(period_key) or raw.get("period") or raw.get("label"))
    if not period:
      raise ValueError(f"Missing required period field: {period_key}")

    result: dict[str, object] = {"period": period}
    number_fields = {
        "revenueCr": ("revenueCr", "revenue_cr", "salesCr", "sales_cr"),
        "ebitdaCr": ("ebitdaCr", "ebitda_cr"),
        "patCr": ("patCr", "pat_cr", "profitAfterTaxCr"),
        "operatingCashFlowCr": ("operatingCashFlowCr", "operating_cash_flow_cr", "ocfCr"),
        "ebitdaMarginPct": ("ebitdaMarginPct", "ebitda_margin_pct"),
        "patMarginPct": ("patMarginPct", "pat_margin_pct"),
        "roePct": ("roePct", "roe_pct"),
        "rocePct": ("rocePct", "roce_pct"),
        "netDebtToEbitda": ("netDebtToEbitda", "net_debt_to_ebitda"),
    }

    for target, aliases in number_fields.items():
        for alias in aliases:
            value = _to_number(raw.get(alias))
            if value is not None:
                result[target] = value
                break

    filing_source = _to_text(raw.get("filingSource") or raw.get("filing_source") or raw.get("source"))
    if filing_source:
        result["filingSource"] = filing_source

    return result


def _normalize_mix_rows(rows: list[dict[str, Any]]) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for row in rows:
        label = _to_text(row.get("label") or row.get("name") or row.get("segment") or row.get("geography"))
        value_pct = _to_number(row.get("valuePct") or row.get("value_pct") or row.get("sharePct") or row.get("share_pct"))
        if label is None or value_pct is None:
            continue

        item: dict[str, object] = {
            "label": label,
            "valuePct": value_pct,
        }
        as_of_period = _to_text(row.get("asOfPeriod") or row.get("as_of_period"))
        if as_of_period:
            item["asOfPeriod"] = as_of_period
        normalized.append(item)
    return normalized


def _normalize_business_notes(rows: list[dict[str, Any]], default_source_kind: str) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for row in rows:
        note = _to_text(row.get("note") or row.get("summary") or row.get("text"))
        if not note:
            continue
        item: dict[str, object] = {
            "sourceKind": _to_text(row.get("sourceKind") or row.get("source_kind")) or default_source_kind,
            "note": note,
        }
        source_url = _to_text(row.get("sourceUrl") or row.get("source_url"))
        source_excerpt = _to_text(row.get("sourceExcerpt") or row.get("source_excerpt") or row.get("excerpt"))
        if source_url:
            item["sourceUrl"] = source_url
        if source_excerpt:
            item["sourceExcerpt"] = source_excerpt
        normalized.append(item)
    return normalized


def _normalize_ratios(raw: dict[str, Any]) -> dict[str, object]:
    aliases = {
        "roePct": ("roePct", "roe_pct"),
        "rocePct": ("rocePct", "roce_pct"),
        "ebitdaMarginPct": ("ebitdaMarginPct", "ebitda_margin_pct"),
        "patMarginPct": ("patMarginPct", "pat_margin_pct"),
        "netDebtToEbitda": ("netDebtToEbitda", "net_debt_to_ebitda"),
        "peRatio": ("peRatio", "pe_ratio"),
        "pbRatio": ("pbRatio", "pb_ratio"),
        "revenueGrowthPct": ("revenueGrowthPct", "revenue_growth_pct"),
    }
    normalized: dict[str, object] = {}
    for target, keys in aliases.items():
        for key in keys:
            value = _to_number(raw.get(key))
            if value is not None:
                normalized[target] = value
                break
    return normalized


def normalize_filing_extract_record(raw: dict[str, Any]) -> dict[str, object]:
    company = raw.get("company", raw)
    symbol = _to_text(company.get("symbol") or raw.get("symbol"))
    if not symbol:
        raise ValueError("Each filing extraction record must include a symbol.")

    exchange = _to_text(company.get("exchange") or raw.get("exchange")) or "NSE"
    as_of_date = _to_text(raw.get("asOfDate") or raw.get("as_of_date") or raw.get("snapshotDate"))

    yearly_source = raw.get("yearlyFinancials") or raw.get("yearly_financials") or raw.get("yearly") or []
    quarterly_source = raw.get("quarterlyFinancials") or raw.get("quarterly_financials") or raw.get("quarterly") or []
    ratios_source = raw.get("ratios") or raw.get("ratioSnapshot") or {}
    segment_source = raw.get("segmentMix") or raw.get("segments") or []
    geography_source = raw.get("geographyMix") or raw.get("geographies") or raw.get("geography") or []
    notes_source = raw.get("businessNotes") or raw.get("notes") or raw.get("business_notes") or []
    peer_group = raw.get("peerGroup") or {}

    normalized: dict[str, object] = {
        "symbol": symbol.upper(),
        "exchange": exchange.upper(),
        "yearlyFinancials": [
            _normalize_period_row(item, period_key="fiscalYear")
            for item in yearly_source
            if isinstance(item, dict)
        ],
        "quarterlyFinancials": [
            _normalize_period_row(item, period_key="fiscalQuarter")
            for item in quarterly_source
            if isinstance(item, dict)
        ],
        "segmentMix": _normalize_mix_rows([item for item in segment_source if isinstance(item, dict)]),
        "geographyMix": _normalize_mix_rows([item for item in geography_source if isinstance(item, dict)]),
        "businessNotes": _normalize_business_notes(
            [item for item in notes_source if isinstance(item, dict)],
            default_source_kind=_to_text(raw.get("sourceKind")) or "filing-extract",
        ),
    }

    if as_of_date:
        normalized["asOfDate"] = as_of_date

    ratios = _normalize_ratios(ratios_source if isinstance(ratios_source, dict) else {})
    if ratios:
        normalized["ratios"] = ratios

    peer_group_slug = _to_text(peer_group.get("slug") if isinstance(peer_group, dict) else raw.get("peerGroupSlug"))
    peer_group_label = _to_text(peer_group.get("label") if isinstance(peer_group, dict) else raw.get("peerGroupLabel"))
    peer_members_raw = peer_group.get("members") if isinstance(peer_group, dict) else raw.get("peerMembers")
    if peer_group_slug:
        normalized["peerGroupSlug"] = peer_group_slug
    if peer_group_label:
        normalized["peerGroupLabel"] = peer_group_label
    if isinstance(peer_members_raw, list):
        normalized["peerMembers"] = [
            value.upper()
            for value in (_to_text(item) for item in peer_members_raw)
            if value
        ]

    return normalized


def read_filing_extract_json(path: str | os.PathLike[str]) -> list[dict[str, object]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        records = payload.get("records", [payload])
    elif isinstance(payload, list):
        records = payload
    else:
        raise ValueError("Filing extract input must be a JSON object or list.")

    normalized: list[dict[str, object]] = []
    for item in records:
        if not isinstance(item, dict):
            continue
        normalized.append(normalize_filing_extract_record(item))
    return normalized


def write_fundamentals_json(path: str | os.PathLike[str], records: list[dict[str, object]]) -> None:
    Path(path).write_text(json.dumps(records, indent=2), encoding="utf-8")
