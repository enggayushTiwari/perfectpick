from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from stock_platform.analytics.strategies import evaluate_strategies
from stock_platform.ingestion.adapters.official import OFFICIAL_SOURCES, build_fetch_registry
from stock_platform.ingestion.eod_market_data import (
    build_eod_market_payload,
    push_eod_market_payload,
    read_eod_market_csv,
)
from stock_platform.ingestion.filing_extraction import read_filing_extract_json, write_fundamentals_json
from stock_platform.ingestion.fundamentals_data import (
    build_fundamentals_payload,
    push_fundamentals_payload,
    read_fundamentals_json,
)
from stock_platform.ingestion.parser_orchestrator import (
    extract_from_mca_xbrl_json,
    extract_from_ocr_text,
    extract_from_ocr_text_with_ai,
    orchestrate_manifest,
)
from stock_platform.ingestion.document_queue import process_filing_queue
from stock_platform.ingestion.queue_runner import drain_filing_queue, run_filing_queue_worker
from stock_platform.ingestion.security_master import (
    build_security_master_payload,
    push_security_master_payload,
    read_security_master_csv,
)
from stock_platform.ingestion.source_extractors import (
    normalize_source_extract_records,
    read_annual_report_extract_json,
    read_investor_presentation_extract_json,
    read_mca_xbrl_extract_json,
    write_filing_extract_json,
)
from stock_platform.models import IndicatorSnapshot


def _security_master_command(args: argparse.Namespace) -> None:
    exchange = args.exchange.upper()
    adapter_key = "nse_eod" if exchange == "NSE" else "bse_bhavcopy"
    adapter_label = "NSE Security Master" if exchange == "NSE" else "BSE Security Master"
    records = read_security_master_csv(args.input, exchange)
    payload = build_security_master_payload(
        records,
        adapter_key=adapter_key,
        adapter_label=adapter_label,
        exchange=exchange,
        detail=f"Bulk security master refresh loaded {len(records)} rows from {args.input}.",
    )

    if args.push:
        result = push_security_master_payload(payload)
        print(json.dumps(result, indent=2))
        return

    preview = {
        "exchange": exchange,
        "records": len(records),
        "sample": [payload["records"][index] for index in range(min(3, len(payload["records"])))],
    }
    print(json.dumps(preview, indent=2))


def _eod_market_command(args: argparse.Namespace) -> None:
    exchange = args.exchange.upper()
    adapter_key = "nse_eod" if exchange == "NSE" else "bse_bhavcopy"
    adapter_label = "NSE EOD" if exchange == "NSE" else "BSE Bhav Copy"
    records = read_eod_market_csv(args.input, exchange, args.price_date)
    payload = build_eod_market_payload(
        records,
        adapter_key=adapter_key,
        adapter_label=adapter_label,
        exchange=exchange,
        detail=f"Bulk EOD refresh loaded {len(records)} rows from {args.input}.",
    )

    if args.push:
        result = push_eod_market_payload(payload)
        print(json.dumps(result, indent=2))
        return

    preview = {
        "exchange": exchange,
        "records": len(records),
        "sample": [payload["records"][index] for index in range(min(3, len(payload["records"])))],
    }
    print(json.dumps(preview, indent=2))


def _fundamentals_command(args: argparse.Namespace) -> None:
    exchange = args.exchange.upper()
    records = read_fundamentals_json(args.input)
    payload = build_fundamentals_payload(
        records,
        adapter_key="mca_filings",
        adapter_label="MCA Filings",
        exchange=exchange,
        detail=f"Bulk fundamentals refresh loaded {len(records)} records from {args.input}.",
    )

    if args.push:
        result = push_fundamentals_payload(payload)
        print(json.dumps(result, indent=2))
        return

    preview = {
        "exchange": exchange,
        "records": len(records),
        "sample": [payload["records"][index] for index in range(min(2, len(payload["records"])))],
    }
    print(json.dumps(preview, indent=2))


def _filing_extract_command(args: argparse.Namespace) -> None:
    exchange = args.exchange.upper()
    records = read_filing_extract_json(args.input)

    if args.output:
        write_fundamentals_json(args.output, records)

    if args.push:
        payload = build_fundamentals_payload(
            records,
            adapter_key="mca_filings",
            adapter_label="MCA Filings",
            exchange=exchange,
            detail=f"Filing extraction normalization loaded {len(records)} records from {args.input}.",
        )
        result = push_fundamentals_payload(payload)
        print(json.dumps(result, indent=2))
        return

    preview = {
        "exchange": exchange,
        "records": len(records),
        "output": args.output,
        "sample": records[: min(2, len(records))],
    }
    print(json.dumps(preview, indent=2))


def _source_extract_command(args: argparse.Namespace, *, source_name: str, reader: callable) -> None:
    exchange = args.exchange.upper()
    filing_records = reader(args.input)
    normalized_records = normalize_source_extract_records(filing_records)

    if args.output:
        write_filing_extract_json(args.output, filing_records)
    if args.normalized_output:
        write_fundamentals_json(args.normalized_output, normalized_records)

    if args.push:
        payload = build_fundamentals_payload(
            normalized_records,
            adapter_key="mca_filings" if source_name != "investor-presentation" else "investor_relations",
            adapter_label="MCA Filings" if source_name != "investor-presentation" else "Investor Relations",
            exchange=exchange,
            detail=f"{source_name} extraction normalized {len(normalized_records)} records from {args.input}.",
        )
        result = push_fundamentals_payload(payload)
        print(json.dumps(result, indent=2))
        return

    preview = {
        "source": source_name,
        "exchange": exchange,
        "records": len(filing_records),
        "output": args.output,
        "normalizedOutput": args.normalized_output,
        "sampleFilingRecord": filing_records[:1],
        "sampleNormalizedRecord": normalized_records[:1],
    }
    print(json.dumps(preview, indent=2))


def _parse_document_command(args: argparse.Namespace) -> None:
    metadata = {
        "symbol": args.symbol,
        "exchange": args.exchange.upper(),
        "asOfDate": args.as_of_date,
        "documentDate": args.as_of_date,
        "peerGroupSlug": args.peer_group_slug,
        "peerGroupLabel": args.peer_group_label,
        "peerMembers": args.peer_members or [],
    }

    if args.source_type == "mca-xbrl-json":
        payload = extract_from_mca_xbrl_json(args.input, metadata)
    elif args.source_type in {"annual-report-ocr", "investor-presentation-ocr"}:
        payload = (
            extract_from_ocr_text_with_ai(args.input, metadata, source_type=args.source_type)
            if args.ai_ocr
            else extract_from_ocr_text(args.input, metadata, source_type=args.source_type)
        )
    else:
        raise ValueError(f"Unsupported source type: {args.source_type}")

    if args.output:
        write_filing_extract_json(args.output, payload)

    print(
        json.dumps(
            {
                "sourceType": args.source_type,
                "symbol": args.symbol,
                "output": args.output,
                "payload": payload,
            },
            indent=2,
        )
    )


def _orchestrate_command(args: argparse.Namespace) -> None:
    result = orchestrate_manifest(args.manifest, ai_ocr=args.ai_ocr)
    print(json.dumps(result, indent=2))


def _process_filing_queue_command(args: argparse.Namespace) -> None:
    result = process_filing_queue(
        limit_count=args.limit,
        ai_ocr=args.ai_ocr,
        push_fundamentals=not args.no_push,
    )
    print(json.dumps(result, indent=2))


def _drain_filing_queue_command(args: argparse.Namespace) -> None:
    result = drain_filing_queue(
        batch_limit=args.batch_limit,
        max_batches=args.max_batches,
        ai_ocr=args.ai_ocr,
        push_fundamentals=not args.no_push,
    )
    print(json.dumps(result, indent=2))


def _run_filing_queue_worker_command(args: argparse.Namespace) -> None:
    run_filing_queue_worker(
        batch_limit=args.batch_limit,
        max_batches_per_cycle=args.max_batches_per_cycle,
        poll_interval_seconds=args.poll_interval,
        idle_backoff_seconds=args.idle_backoff,
        ai_ocr=args.ai_ocr,
        push_fundamentals=not args.no_push,
    )


def _demo_command() -> None:
    registry = build_fetch_registry("2026-03-27")
    sample = IndicatorSnapshot(
        symbol="RELIANCE",
        close=3021.6,
        sma_20=2968.2,
        sma_50=2894.1,
        sma_200=2750.3,
        rsi_14=63.4,
        volume_confirmation=True,
        upcoming_event=True,
        roe_pct=10.9,
    )
    outcomes = evaluate_strategies(sample)

    payload = {
        "sources": [
            {
                "key": adapter.descriptor.key,
                "label": adapter.descriptor.label,
                "authority": adapter.descriptor.authority,
                "cadence": adapter.descriptor.cadence,
                "notes": adapter.descriptor.notes,
            }
            for adapter in OFFICIAL_SOURCES
        ],
        "fetch_registry": registry,
        "sample_outcomes": [asdict(outcome) for outcome in outcomes],
    }
    print(json.dumps(payload, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="PerfectPick worker entrypoints")
    subparsers = parser.add_subparsers(dest="command")

    security_master = subparsers.add_parser("security-master", help="Normalize and optionally push official security-master CSV data.")
    security_master.add_argument("--input", required=True, help="Path to the official CSV export.")
    security_master.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], required=True, help="Source exchange for the CSV.")
    security_master.add_argument("--push", action="store_true", help="Push the normalized payload to Supabase via RPC.")

    eod_market = subparsers.add_parser("eod-market", help="Normalize and optionally push official EOD CSV data.")
    eod_market.add_argument("--input", required=True, help="Path to the official EOD CSV export.")
    eod_market.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], required=True, help="Source exchange for the CSV.")
    eod_market.add_argument("--price-date", help="Fallback trade date to use when the CSV has no explicit date column.")
    eod_market.add_argument("--push", action="store_true", help="Push the normalized payload to Supabase via RPC.")

    fundamentals = subparsers.add_parser("fundamentals", help="Normalize and optionally push fundamentals JSON data.")
    fundamentals.add_argument("--input", required=True, help="Path to the fundamentals JSON export.")
    fundamentals.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], default="NSE", help="Primary exchange for symbol resolution.")
    fundamentals.add_argument("--push", action="store_true", help="Push the normalized payload to Supabase via RPC.")

    filing_extract = subparsers.add_parser("filing-extract", help="Convert annual report or MCA extraction JSON into the fundamentals import shape.")
    filing_extract.add_argument("--input", required=True, help="Path to the filing extraction JSON export.")
    filing_extract.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], default="NSE", help="Primary exchange for symbol resolution.")
    filing_extract.add_argument("--output", help="Optional path to write the normalized fundamentals JSON.")
    filing_extract.add_argument("--push", action="store_true", help="Push the normalized output directly to Supabase.")

    annual_report = subparsers.add_parser("annual-report-extract", help="Convert annual report extraction JSON into the filing extraction and fundamentals shapes.")
    annual_report.add_argument("--input", required=True, help="Path to the annual report extraction JSON export.")
    annual_report.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], default="NSE", help="Primary exchange for symbol resolution.")
    annual_report.add_argument("--output", help="Optional path to write the filing extraction JSON.")
    annual_report.add_argument("--normalized-output", help="Optional path to write the normalized fundamentals JSON.")
    annual_report.add_argument("--push", action="store_true", help="Push the normalized output directly to Supabase.")

    mca_xbrl = subparsers.add_parser("mca-xbrl-extract", help="Convert MCA/XBRL extraction JSON into the filing extraction and fundamentals shapes.")
    mca_xbrl.add_argument("--input", required=True, help="Path to the MCA/XBRL extraction JSON export.")
    mca_xbrl.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], default="NSE", help="Primary exchange for symbol resolution.")
    mca_xbrl.add_argument("--output", help="Optional path to write the filing extraction JSON.")
    mca_xbrl.add_argument("--normalized-output", help="Optional path to write the normalized fundamentals JSON.")
    mca_xbrl.add_argument("--push", action="store_true", help="Push the normalized output directly to Supabase.")

    investor_presentation = subparsers.add_parser("investor-presentation-extract", help="Convert investor presentation extraction JSON into the filing extraction and fundamentals shapes.")
    investor_presentation.add_argument("--input", required=True, help="Path to the investor presentation extraction JSON export.")
    investor_presentation.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], default="NSE", help="Primary exchange for symbol resolution.")
    investor_presentation.add_argument("--output", help="Optional path to write the filing extraction JSON.")
    investor_presentation.add_argument("--normalized-output", help="Optional path to write the normalized fundamentals JSON.")
    investor_presentation.add_argument("--push", action="store_true", help="Push the normalized output directly to Supabase.")

    parse_document = subparsers.add_parser("parse-document", help="Parse a raw OCR/text/XBRL document into filing extraction JSON.")
    parse_document.add_argument("--source-type", choices=["annual-report-ocr", "investor-presentation-ocr", "mca-xbrl-json"], required=True, help="Document source type.")
    parse_document.add_argument("--input", required=True, help="Path to the raw document-derived input.")
    parse_document.add_argument("--symbol", required=True, help="Primary symbol for the document.")
    parse_document.add_argument("--exchange", choices=["NSE", "BSE", "nse", "bse"], default="NSE", help="Primary exchange.")
    parse_document.add_argument("--as-of-date", help="Document or filing date in YYYY-MM-DD format.")
    parse_document.add_argument("--peer-group-slug", help="Optional peer-group slug to attach.")
    parse_document.add_argument("--peer-group-label", help="Optional peer-group label to attach.")
    parse_document.add_argument("--peer-members", nargs="*", help="Optional peer member symbols.")
    parse_document.add_argument("--output", help="Optional path to write the filing extraction JSON.")
    parse_document.add_argument("--ai-ocr", action="store_true", help="Use Gemini to structure OCR text inputs instead of regex heuristics.")

    orchestrate = subparsers.add_parser("orchestrate-filings", help="Run a manifest of raw filing parsing jobs.")
    orchestrate.add_argument("--manifest", required=True, help="Path to the parsing manifest JSON.")
    orchestrate.add_argument("--ai-ocr", action="store_true", help="Use Gemini to structure OCR text jobs in the manifest.")

    process_queue = subparsers.add_parser("process-filing-queue", help="Claim queued filing documents from Supabase and process them.")
    process_queue.add_argument("--limit", type=int, default=5, help="Maximum number of queued documents to claim.")
    process_queue.add_argument("--ai-ocr", action="store_true", help="Use Gemini to structure OCR text jobs.")
    process_queue.add_argument("--no-push", action="store_true", help="Do not push normalized fundamentals into Supabase after parsing.")

    drain_queue = subparsers.add_parser("drain-filing-queue", help="Drain the filing queue in repeated batches until it is empty or the batch cap is reached.")
    drain_queue.add_argument("--batch-limit", type=int, default=5, help="Maximum number of queued documents to claim per batch.")
    drain_queue.add_argument("--max-batches", type=int, default=10, help="Maximum number of batches to process in one drain run.")
    drain_queue.add_argument("--ai-ocr", action="store_true", help="Use Gemini to structure OCR text jobs.")
    drain_queue.add_argument("--no-push", action="store_true", help="Do not push normalized fundamentals into Supabase after parsing.")

    worker_queue = subparsers.add_parser("run-filing-queue-worker", help="Run a long-lived filing queue worker that polls and drains automatically.")
    worker_queue.add_argument("--batch-limit", type=int, default=5, help="Maximum number of queued documents to claim per batch.")
    worker_queue.add_argument("--max-batches-per-cycle", type=int, default=10, help="Maximum batches to process before the worker checks whether it should sleep.")
    worker_queue.add_argument("--poll-interval", type=int, default=60, help="Seconds to wait between idle polling cycles.")
    worker_queue.add_argument("--idle-backoff", type=int, help="Optional idle sleep override in seconds.")
    worker_queue.add_argument("--ai-ocr", action="store_true", help="Use Gemini to structure OCR text jobs.")
    worker_queue.add_argument("--no-push", action="store_true", help="Do not push normalized fundamentals into Supabase after parsing.")

    args = parser.parse_args()

    if args.command == "security-master":
        _security_master_command(args)
        return

    if args.command == "eod-market":
        _eod_market_command(args)
        return

    if args.command == "fundamentals":
        _fundamentals_command(args)
        return

    if args.command == "filing-extract":
        _filing_extract_command(args)
        return

    if args.command == "annual-report-extract":
        _source_extract_command(args, source_name="annual-report", reader=read_annual_report_extract_json)
        return

    if args.command == "mca-xbrl-extract":
        _source_extract_command(args, source_name="mca-xbrl", reader=read_mca_xbrl_extract_json)
        return

    if args.command == "investor-presentation-extract":
        _source_extract_command(args, source_name="investor-presentation", reader=read_investor_presentation_extract_json)
        return

    if args.command == "parse-document":
        _parse_document_command(args)
        return

    if args.command == "orchestrate-filings":
        _orchestrate_command(args)
        return

    if args.command == "process-filing-queue":
        _process_filing_queue_command(args)
        return

    if args.command == "drain-filing-queue":
        _drain_filing_queue_command(args)
        return

    if args.command == "run-filing-queue-worker":
        _run_filing_queue_worker_command(args)
        return

    _demo_command()


if __name__ == "__main__":
    main()
