from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib import error, request

from stock_platform.ingestion.filing_extraction import normalize_filing_extract_record, write_fundamentals_json
from stock_platform.ingestion.fundamentals_data import build_fundamentals_payload, push_fundamentals_payload
from stock_platform.ingestion.parser_orchestrator import (
    extract_from_mca_xbrl_json,
    extract_from_ocr_text,
    extract_from_ocr_text_with_ai,
)
from stock_platform.ingestion.source_extractors import write_filing_extract_json


def _rpc(function_name: str, body: dict[str, object]) -> Any:
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

    rpc_url = supabase_url.rstrip("/") + f"/rest/v1/rpc/{function_name}"
    data = json.dumps(body).encode("utf-8")
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    req = request.Request(rpc_url, data=data, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=90) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else None
    except error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase RPC failed: {exc.code} {message}") from exc


def claim_filing_documents(limit_count: int = 5) -> list[dict[str, Any]]:
    payload = _rpc("app_claim_filing_documents", {"limit_count": limit_count})
    return payload if isinstance(payload, list) else []


def complete_filing_document(document_id: str, final_status: str, result_payload: dict[str, object]) -> dict[str, Any]:
    payload = _rpc(
        "app_complete_filing_document",
        {
            "document_id": document_id,
            "final_status": final_status,
            "result_payload": result_payload,
        },
    )
    return payload if isinstance(payload, dict) else {}


def _default_output_path(input_path: str, document_id: str) -> str:
    path = Path(input_path)
    return str(path.with_name(f"{path.stem}.{document_id}.raw.json"))


def _default_normalized_output_path(output_path: str) -> str:
    path = Path(output_path)
    return str(path.with_name(f"{path.stem}.normalized.json"))


def _parse_document(job: dict[str, Any], *, ai_ocr: bool) -> dict[str, Any]:
    source_type = str(job.get("sourceType"))
    input_path = str(job.get("inputPath"))
    ocr_path = str(job.get("ocrPath")) if job.get("ocrPath") else None
    metadata = job.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
    metadata = {
        **metadata,
        "symbol": job.get("symbol"),
        "exchange": job.get("exchange"),
        "inputPath": input_path,
        "ocrPath": ocr_path,
    }

    if source_type == "mca-xbrl-json":
        return extract_from_mca_xbrl_json(input_path, metadata)
    if source_type in {"annual-report-ocr", "investor-presentation-ocr"}:
        parse_path = ocr_path or input_path
        return (
            extract_from_ocr_text_with_ai(parse_path, metadata, source_type=source_type)
            if ai_ocr
            else extract_from_ocr_text(parse_path, metadata, source_type=source_type)
        )

    raise ValueError(f"Unsupported document source type: {source_type}")


def process_filing_document(job: dict[str, Any], *, ai_ocr: bool = False, push_fundamentals: bool = True) -> dict[str, Any]:
    document_id = str(job["id"])
    input_path = str(job["inputPath"])
    base_input_path = str(job.get("ocrPath") or input_path)
    output_path = str(job.get("outputPath") or _default_output_path(base_input_path, document_id))
    normalized_output_path = str(job.get("normalizedOutputPath") or _default_normalized_output_path(output_path))

    metadata = job.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}

    raw_payload = _parse_document(job, ai_ocr=ai_ocr)
    write_filing_extract_json(output_path, raw_payload)

    normalized_record = normalize_filing_extract_record(raw_payload)
    write_fundamentals_json(normalized_output_path, [normalized_record])

    push_status = "skipped"
    push_result: dict[str, Any] | None = None
    should_push = bool(metadata.get("pushFundamentals", push_fundamentals))
    if should_push:
        payload = build_fundamentals_payload(
            [normalized_record],
            adapter_key="mca_filings" if job.get("sourceType") != "investor-presentation-ocr" else "investor_relations",
            adapter_label="MCA Filings" if job.get("sourceType") != "investor-presentation-ocr" else "Investor Relations",
            exchange=str(job.get("exchange", "NSE")),
            detail=f"Document queue processed 1 record for {job.get('symbol')}.",
        )
        try:
            push_result = push_fundamentals_payload(payload)
            push_status = "success"
        except Exception as exc:  # noqa: BLE001
            push_status = "failed"
            complete_filing_document(
                document_id,
                "failed",
                {
                    "outputPath": output_path,
                    "normalizedOutputPath": normalized_output_path,
                    "errorMessage": str(exc),
                    "pushStatus": push_status,
                },
            )
            raise

    result_payload = {
        "outputPath": output_path,
        "normalizedOutputPath": normalized_output_path,
        "pushStatus": push_status,
    }
    if push_result is not None:
        result_payload["pushResult"] = push_result

    complete_filing_document(document_id, "completed", result_payload)
    return {
        "documentId": document_id,
        "symbol": job.get("symbol"),
        "outputPath": output_path,
        "normalizedOutputPath": normalized_output_path,
        "pushStatus": push_status,
    }


def process_filing_queue(limit_count: int = 5, *, ai_ocr: bool = False, push_fundamentals: bool = True) -> dict[str, Any]:
    jobs = claim_filing_documents(limit_count)
    processed: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for job in jobs:
        try:
            processed.append(process_filing_document(job, ai_ocr=ai_ocr, push_fundamentals=push_fundamentals))
        except Exception as exc:  # noqa: BLE001
            failures.append(
                {
                    "documentId": job.get("id"),
                    "symbol": job.get("symbol"),
                    "error": str(exc),
                }
            )

    return {
        "claimed": len(jobs),
        "processed": processed,
        "failures": failures,
    }
