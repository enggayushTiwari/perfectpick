from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from stock_platform.ingestion.filing_extraction import normalize_filing_extract_record


def _to_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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


def _read_json(path: str | os.PathLike[str]) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _as_record_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        records = payload.get("records", [payload])
    elif isinstance(payload, list):
        records = payload
    else:
        raise ValueError("Extractor input must be a JSON object or list.")

    return [item for item in records if isinstance(item, dict)]


def _compact_none(mapping: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in mapping.items() if value is not None and value != [] and value != {}}


def _note_list(rows: list[dict[str, Any]], *, source_kind: str) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for row in rows:
        note = _to_text(row.get("note") or row.get("summary") or row.get("message") or row.get("text"))
        if not note:
            continue
        notes.append(
            _compact_none(
                {
                    "sourceKind": _to_text(row.get("sourceKind")) or source_kind,
                    "sourceUrl": _to_text(row.get("sourceUrl") or row.get("source_url")),
                    "note": note,
                    "sourceExcerpt": _to_text(row.get("sourceExcerpt") or row.get("excerpt")),
                }
            )
        )
    return notes


def _mix_list(rows: list[dict[str, Any]], *, label_keys: tuple[str, ...]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in rows:
        label = next((_to_text(row.get(key)) for key in label_keys if _to_text(row.get(key))), None)
        value_pct = next((_to_number(row.get(key)) for key in ("valuePct", "value_pct", "sharePct", "share_pct", "mixPct")), None)
        if label is None or value_pct is None:
            continue
        output.append(
            _compact_none(
                {
                    "label": label,
                    "valuePct": value_pct,
                    "asOfPeriod": _to_text(row.get("asOfPeriod") or row.get("as_of_period")),
                }
            )
        )
    return output


def _period_rows(rows: list[dict[str, Any]], *, period_key: str, default_source: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    field_map = {
        "revenueCr": ("revenueCr", "revenue_cr", "salesCr", "sales_cr"),
        "ebitdaCr": ("ebitdaCr", "ebitda_cr"),
        "patCr": ("patCr", "pat_cr", "profitAfterTaxCr", "profit_after_tax_cr"),
        "operatingCashFlowCr": ("operatingCashFlowCr", "operating_cash_flow_cr", "ocfCr"),
        "ebitdaMarginPct": ("ebitdaMarginPct", "ebitda_margin_pct"),
        "patMarginPct": ("patMarginPct", "pat_margin_pct"),
        "roePct": ("roePct", "roe_pct"),
        "rocePct": ("rocePct", "roce_pct"),
        "netDebtToEbitda": ("netDebtToEbitda", "net_debt_to_ebitda"),
    }

    for row in rows:
        period = _to_text(row.get(period_key) or row.get("period") or row.get("label"))
        if not period:
            continue
        item: dict[str, Any] = {"period": period}
        for target, aliases in field_map.items():
          for alias in aliases:
            value = _to_number(row.get(alias))
            if value is not None:
              item[target] = value
              break
        item["filingSource"] = _to_text(row.get("filingSource") or row.get("source")) or default_source
        output.append(_compact_none(item))
    return output


def _ratios_from_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
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
    for target, keys in aliases.items():
        for key in keys:
            value = _to_number(mapping.get(key))
            if value is not None:
                output[target] = value
                break
    return output


def transform_annual_report_record(raw: dict[str, Any]) -> dict[str, Any]:
    company = raw.get("company", {})
    output = _compact_none(
        {
            "company": {
                "symbol": _to_text(company.get("symbol") or raw.get("symbol")),
                "exchange": _to_text(company.get("exchange") or raw.get("exchange")) or "NSE",
            },
            "asOfDate": _to_text(raw.get("asOfDate") or raw.get("reportDate") or raw.get("report_date")),
            "sourceKind": "annual-report",
            "yearlyFinancials": _period_rows(
                [item for item in raw.get("financialStatements", {}).get("yearly", raw.get("yearlyFinancials", [])) if isinstance(item, dict)],
                period_key="fiscalYear",
                default_source="annual-report",
            ),
            "quarterlyFinancials": _period_rows(
                [item for item in raw.get("financialHighlights", {}).get("quarterly", raw.get("quarterlyFinancials", [])) if isinstance(item, dict)],
                period_key="fiscalQuarter",
                default_source="annual-report",
            ),
            "ratios": _ratios_from_mapping(raw.get("ratios", {})),
            "segments": _mix_list([item for item in raw.get("segments", []) if isinstance(item, dict)], label_keys=("name", "segment", "label")),
            "geographies": _mix_list([item for item in raw.get("geographies", []) if isinstance(item, dict)], label_keys=("name", "geography", "label")),
            "notes": _note_list([item for item in raw.get("managementDiscussion", raw.get("notes", [])) if isinstance(item, dict)], source_kind="annual-report"),
            "peerGroup": raw.get("peerGroup") if isinstance(raw.get("peerGroup"), dict) else None,
        }
    )
    return output


def transform_mca_xbrl_record(raw: dict[str, Any]) -> dict[str, Any]:
    entity = raw.get("entity", {})
    facts = raw.get("facts", {})
    xbrl = raw.get("xbrl", {})
    output = _compact_none(
        {
            "company": {
                "symbol": _to_text(entity.get("symbol") or raw.get("symbol")),
                "exchange": _to_text(entity.get("exchange") or raw.get("exchange")) or "NSE",
            },
            "asOfDate": _to_text(raw.get("asOfDate") or raw.get("filingDate") or raw.get("filing_date")),
            "sourceKind": "mca-xbrl",
            "yearlyFinancials": _period_rows(
                [item for item in facts.get("yearly", xbrl.get("yearly", [])) if isinstance(item, dict)],
                period_key="fiscalYear",
                default_source="mca-xbrl",
            ),
            "quarterlyFinancials": _period_rows(
                [item for item in facts.get("quarterly", xbrl.get("quarterly", [])) if isinstance(item, dict)],
                period_key="fiscalQuarter",
                default_source="mca-xbrl",
            ),
            "ratios": _ratios_from_mapping(raw.get("ratios", facts.get("ratios", {}))),
            "segments": _mix_list([item for item in facts.get("segments", []) if isinstance(item, dict)], label_keys=("segment", "name", "label")),
            "geographies": _mix_list([item for item in facts.get("geographies", []) if isinstance(item, dict)], label_keys=("geography", "name", "label")),
            "notes": _note_list([item for item in raw.get("businessNotes", facts.get("notes", [])) if isinstance(item, dict)], source_kind="mca-xbrl"),
            "peerGroup": raw.get("peerGroup") if isinstance(raw.get("peerGroup"), dict) else None,
        }
    )
    return output


def transform_investor_presentation_record(raw: dict[str, Any]) -> dict[str, Any]:
    company = raw.get("company", {})
    highlights = raw.get("highlights", {})
    output = _compact_none(
        {
            "company": {
                "symbol": _to_text(company.get("symbol") or raw.get("symbol")),
                "exchange": _to_text(company.get("exchange") or raw.get("exchange")) or "NSE",
            },
            "asOfDate": _to_text(raw.get("asOfDate") or raw.get("presentationDate") or raw.get("presentation_date")),
            "sourceKind": "investor-presentation",
            "yearlyFinancials": _period_rows(
                [item for item in highlights.get("yearly", raw.get("yearlyFinancials", [])) if isinstance(item, dict)],
                period_key="fiscalYear",
                default_source="investor-presentation",
            ),
            "quarterlyFinancials": _period_rows(
                [item for item in highlights.get("quarterly", raw.get("quarterlyFinancials", [])) if isinstance(item, dict)],
                period_key="fiscalQuarter",
                default_source="investor-presentation",
            ),
            "ratios": _ratios_from_mapping(raw.get("ratios", highlights.get("ratios", {}))),
            "segments": _mix_list([item for item in raw.get("segmentMix", raw.get("segments", [])) if isinstance(item, dict)], label_keys=("label", "segment", "name")),
            "geographies": _mix_list([item for item in raw.get("geographyMix", raw.get("geographies", [])) if isinstance(item, dict)], label_keys=("label", "geography", "name")),
            "notes": _note_list([item for item in raw.get("managementMessages", raw.get("notes", [])) if isinstance(item, dict)], source_kind="investor-presentation"),
            "peerGroup": raw.get("peerGroup") if isinstance(raw.get("peerGroup"), dict) else None,
        }
    )
    return output


def _transform_many(path: str | os.PathLike[str], transformer: Any) -> list[dict[str, Any]]:
    return [transformer(item) for item in _as_record_list(_read_json(path))]


def read_annual_report_extract_json(path: str | os.PathLike[str]) -> list[dict[str, object]]:
    return _transform_many(path, transform_annual_report_record)


def read_mca_xbrl_extract_json(path: str | os.PathLike[str]) -> list[dict[str, object]]:
    return _transform_many(path, transform_mca_xbrl_record)


def read_investor_presentation_extract_json(path: str | os.PathLike[str]) -> list[dict[str, object]]:
    return _transform_many(path, transform_investor_presentation_record)


def write_filing_extract_json(path: str | os.PathLike[str], records: list[dict[str, object]]) -> None:
    Path(path).write_text(json.dumps(records, indent=2), encoding="utf-8")


def normalize_source_extract_records(records: list[dict[str, object]]) -> list[dict[str, object]]:
    return [normalize_filing_extract_record(record) for record in records]
