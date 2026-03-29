from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib import error, request


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
        normalized = value.replace(",", "").replace("%", "").strip()
        if not normalized:
            return None
        try:
            return float(normalized)
        except ValueError:
            return None
    return None


def _compact_none(mapping: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in mapping.items() if value is not None and value != [] and value != {}}


def _read_json(path: str | os.PathLike[str]) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _read_text(path: str | os.PathLike[str]) -> str:
    return Path(path).read_text(encoding="utf-8")


def _write_json(path: str | os.PathLike[str], payload: Any) -> None:
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _guess_source_kind(source_type: str) -> str:
    if source_type == "annual-report-ocr":
        return "annual-report"
    if source_type == "mca-xbrl-json":
        return "mca-xbrl"
    if source_type == "investor-presentation-ocr":
        return "investor-presentation"
    return source_type


def _first_record(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                return item
    raise ValueError("Expected a JSON object or a list containing at least one JSON object.")


def _extract_period_rows_from_text(text: str, periods: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    metric_patterns = {
        "revenueCr": r"(?:revenue|sales)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)",
        "ebitdaCr": r"(?:ebitda)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)",
        "patCr": r"(?:pat|profit after tax)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)",
        "operatingCashFlowCr": r"(?:operating cash flow|ocf)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)",
        "ebitdaMarginPct": r"(?:ebitda margin)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*%?",
        "patMarginPct": r"(?:pat margin|net margin)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*%?",
        "roePct": r"(?:roe)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*%?",
        "rocePct": r"(?:roce)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*%?",
        "netDebtToEbitda": r"(?:net debt\s*/\s*ebitda|net debt to ebitda)\s*[:\-]?\s*([\d,\-]+(?:\.\d+)?)",
    }

    for period in periods:
        match = re.search(rf"{re.escape(period)}(?P<body>[\s\S]{{0,400}})", text, flags=re.IGNORECASE)
        if not match:
            continue
        body = match.group("body")
        row: dict[str, Any] = {"period": period}
        for field, pattern in metric_patterns.items():
            field_match = re.search(pattern, body, flags=re.IGNORECASE)
            if field_match:
                parsed = _to_number(field_match.group(1))
                if parsed is not None:
                    row[field] = parsed
        rows.append(row)

    return rows


def _extract_mix_from_text(text: str, heading: str) -> list[dict[str, Any]]:
    match = re.search(
        rf"{heading}[\s:,-]*(?P<body>[\s\S]{{0,600}}?)(?:\n\s*\n|(?:[A-Za-z ]+ Mix\b)|$)",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return []

    body = match.group("body")
    rows: list[dict[str, Any]] = []
    for line in body.splitlines():
        cleaned = line.strip(" -\t")
        mix_match = re.match(r"(?P<label>[A-Za-z0-9& /().-]+?)\s+(?P<value>[\d.]+)\s*%$", cleaned)
        if mix_match:
            rows.append({"label": mix_match.group("label").strip(), "valuePct": float(mix_match.group("value"))})
        if len(rows) >= 8:
            break
    return rows


def _extract_notes_from_text(text: str, source_kind: str) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    sentences = re.split(r"(?<=[.!?])\s+", text)
    keywords = ("growth", "margin", "demand", "guidance", "deal", "retail", "telecom", "client", "pipeline", "capex")
    for sentence in sentences:
        cleaned = sentence.strip()
        if len(cleaned) < 35:
            continue
        if re.search(r"\b(?:revenue|ebitda|pat|roe|roce|segment mix|geography mix)\b", cleaned, flags=re.IGNORECASE):
            continue
        lowered = cleaned.lower()
        if any(keyword in lowered for keyword in keywords):
            notes.append(
                {
                    "sourceKind": source_kind,
                    "note": cleaned[:280],
                    "sourceExcerpt": cleaned[:180],
                }
            )
        if len(notes) >= 5:
            break
    return notes


def extract_from_ocr_text(path: str | os.PathLike[str], metadata: dict[str, Any], *, source_type: str) -> dict[str, Any]:
    text = _read_text(path)
    symbol = _to_text(metadata.get("symbol"))
    if not symbol:
        raise ValueError("OCR extraction requires metadata.symbol.")

    exchange = _to_text(metadata.get("exchange")) or "NSE"
    as_of_date = _to_text(metadata.get("asOfDate") or metadata.get("documentDate"))
    peer_members = metadata.get("peerMembers") if isinstance(metadata.get("peerMembers"), list) else None

    yearly_periods = re.findall(r"FY\d{2}", text, flags=re.IGNORECASE)
    quarterly_periods = re.findall(r"Q[1-4]\s*FY\d{2}", text, flags=re.IGNORECASE)
    unique_yearly = list(dict.fromkeys(period.upper().replace(" ", "") for period in yearly_periods))[:4]
    unique_quarterly = list(dict.fromkeys(period.upper().replace(" ", " ") for period in quarterly_periods))[:4]

    ratios = {}
    for label, pattern in {
        "roePct": r"\bROE\b\s*[:\-]?\s*([\d.]+)",
        "rocePct": r"\bROCE\b\s*[:\-]?\s*([\d.]+)",
        "revenueGrowthPct": r"(?:revenue growth|sales growth)\s*[:\-]?\s*([\d.]+)",
    }.items():
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            parsed = _to_number(match.group(1))
            if parsed is not None:
                ratios[label] = parsed

    return _compact_none(
        {
            "company": {
                "symbol": symbol.upper(),
                "exchange": exchange.upper(),
            },
            "asOfDate": as_of_date,
            "sourceKind": _guess_source_kind(source_type),
            "yearlyFinancials": _extract_period_rows_from_text(text, unique_yearly),
            "quarterlyFinancials": _extract_period_rows_from_text(text, unique_quarterly),
            "ratios": ratios,
            "segments": _extract_mix_from_text(text, "segment mix"),
            "geographies": _extract_mix_from_text(text, "geography mix"),
            "notes": _extract_notes_from_text(text, _guess_source_kind(source_type)),
            "peerGroup": _compact_none(
                {
                    "slug": _to_text(metadata.get("peerGroupSlug")),
                    "label": _to_text(metadata.get("peerGroupLabel")),
                    "members": [item.upper() for item in peer_members if _to_text(item)] if peer_members else None,
                }
            ),
        }
    )


def extract_from_mca_xbrl_json(path: str | os.PathLike[str], metadata: dict[str, Any]) -> dict[str, Any]:
    payload = _first_record(_read_json(path))

    entity = payload.get("entity", {})
    facts = payload.get("facts", {})
    ratios = payload.get("ratios", {})

    return _compact_none(
        {
            "entity": {
                "symbol": _to_text(metadata.get("symbol") or entity.get("symbol") or payload.get("symbol")),
                "exchange": _to_text(metadata.get("exchange") or entity.get("exchange") or payload.get("exchange")) or "NSE",
            },
            "filingDate": _to_text(metadata.get("asOfDate") or payload.get("filingDate") or payload.get("asOfDate")),
            "facts": {
                "yearly": [item for item in facts.get("yearly", []) if isinstance(item, dict)],
                "quarterly": [item for item in facts.get("quarterly", []) if isinstance(item, dict)],
                "segments": [item for item in facts.get("segments", []) if isinstance(item, dict)],
                "geographies": [item for item in facts.get("geographies", []) if isinstance(item, dict)],
                "notes": [item for item in facts.get("notes", []) if isinstance(item, dict)],
            },
            "ratios": ratios if isinstance(ratios, dict) else {},
            "peerGroup": payload.get("peerGroup") if isinstance(payload.get("peerGroup"), dict) else None,
        }
    )


def _call_gemini_for_ocr_structuring(text: str, metadata: dict[str, Any], source_type: str) -> dict[str, Any]:
    api_key = (
        os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key:
        raise RuntimeError("Gemini API key is not configured for AI-assisted OCR parsing.")

    model = os.environ.get("GOOGLE_GENAI_MODEL") or os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash"
    prompt = {
        "task": "Convert OCR text into structured filing extraction JSON.",
        "sourceType": source_type,
        "metadata": metadata,
        "requiredKeys": [
            "company.symbol",
            "company.exchange",
            "asOfDate",
            "sourceKind",
            "yearlyFinancials",
            "quarterlyFinancials",
            "ratios",
            "segments",
            "geographies",
            "notes",
            "peerGroup",
        ],
        "rules": [
            "Return valid JSON only.",
            "Do not invent values not grounded in the OCR text or metadata.",
            "Use empty arrays when information is missing.",
            "Keep note text concise.",
        ],
        "ocrText": text[:18000],
    }

    body = json.dumps(
        {
            "contents": [{"role": "user", "parts": [{"text": json.dumps(prompt)}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json", "maxOutputTokens": 2048},
        }
    ).encode("utf-8")
    req = request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini OCR structuring failed: {exc.code} {message}") from exc

    text_parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    combined = "".join(part.get("text", "") for part in text_parts if isinstance(part, dict)).strip()
    if not combined:
        raise RuntimeError("Gemini OCR structuring returned no content.")
    return json.loads(combined)


def extract_from_ocr_text_with_ai(path: str | os.PathLike[str], metadata: dict[str, Any], *, source_type: str) -> dict[str, Any]:
    return _call_gemini_for_ocr_structuring(_read_text(path), metadata, source_type)


def orchestrate_manifest(manifest_path: str | os.PathLike[str], *, ai_ocr: bool = False) -> dict[str, Any]:
    manifest = _read_json(manifest_path)
    if not isinstance(manifest, dict):
        raise ValueError("Manifest must be a JSON object.")

    jobs = manifest.get("jobs", [])
    if not isinstance(jobs, list):
        raise ValueError("Manifest.jobs must be a list.")

    outputs: list[dict[str, Any]] = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        source_type = _to_text(job.get("sourceType"))
        input_path = _to_text(job.get("inputPath"))
        output_path = _to_text(job.get("outputPath"))
        metadata = job.get("metadata", {})
        if not source_type or not input_path or not output_path or not isinstance(metadata, dict):
            raise ValueError("Each manifest job must include sourceType, inputPath, outputPath, and metadata.")

        if source_type == "mca-xbrl-json":
            extracted = extract_from_mca_xbrl_json(input_path, metadata)
        elif source_type in {"annual-report-ocr", "investor-presentation-ocr"}:
            extracted = (
                extract_from_ocr_text_with_ai(input_path, metadata, source_type=source_type)
                if ai_ocr
                else extract_from_ocr_text(input_path, metadata, source_type=source_type)
            )
        else:
            raise ValueError(f"Unsupported manifest sourceType: {source_type}")

        _write_json(output_path, extracted)
        outputs.append(
            {
                "sourceType": source_type,
                "inputPath": input_path,
                "outputPath": output_path,
                "symbol": metadata.get("symbol"),
            }
        )

    return {
        "jobsProcessed": len(outputs),
        "outputs": outputs,
    }
