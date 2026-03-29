from __future__ import annotations

import json
import time
from typing import Any

from stock_platform.ingestion.document_queue import process_filing_queue


def drain_filing_queue(
    *,
    batch_limit: int = 5,
    max_batches: int = 10,
    ai_ocr: bool = False,
    push_fundamentals: bool = True,
) -> dict[str, Any]:
    batches: list[dict[str, Any]] = []
    total_claimed = 0
    total_processed = 0
    failures: list[dict[str, Any]] = []

    for batch_number in range(max_batches):
        result = process_filing_queue(
            limit_count=batch_limit,
            ai_ocr=ai_ocr,
            push_fundamentals=push_fundamentals,
        )
        claimed = int(result.get("claimed", 0))
        processed = result.get("processed", [])
        batch_failures = result.get("failures", [])

        if claimed <= 0:
            break

        total_claimed += claimed
        total_processed += len(processed) if isinstance(processed, list) else 0
        if isinstance(batch_failures, list):
            failures.extend(batch_failures)

        batches.append(
            {
                "batch": batch_number + 1,
                "claimed": claimed,
                "processed": processed,
                "failures": batch_failures,
            }
        )

        if claimed < batch_limit:
            break

    return {
        "claimed": total_claimed,
        "processedCount": total_processed,
        "failureCount": len(failures),
        "failures": failures,
        "batches": batches,
    }


def run_filing_queue_worker(
    *,
    batch_limit: int = 5,
    max_batches_per_cycle: int = 10,
    poll_interval_seconds: int = 60,
    idle_backoff_seconds: int | None = None,
    ai_ocr: bool = False,
    push_fundamentals: bool = True,
) -> None:
    sleep_seconds = idle_backoff_seconds if idle_backoff_seconds is not None else poll_interval_seconds

    while True:
        cycle_result = drain_filing_queue(
            batch_limit=batch_limit,
            max_batches=max_batches_per_cycle,
            ai_ocr=ai_ocr,
            push_fundamentals=push_fundamentals,
        )
        print(json.dumps(cycle_result, indent=2), flush=True)

        if cycle_result["claimed"] > 0:
            continue

        time.sleep(max(1, sleep_seconds))
