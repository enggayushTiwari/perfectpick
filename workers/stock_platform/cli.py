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
from stock_platform.ingestion.security_master import (
    build_security_master_payload,
    push_security_master_payload,
    read_security_master_csv,
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

    args = parser.parse_args()

    if args.command == "security-master":
        _security_master_command(args)
        return

    if args.command == "eod-market":
        _eod_market_command(args)
        return

    _demo_command()


if __name__ == "__main__":
    main()
