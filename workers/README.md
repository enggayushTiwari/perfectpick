# PerfectPick workers

This package contains the Python-side workers that fetch official source data, compute deterministic analytics, and write outputs back into Supabase.

## Current scope

- Source adapter contracts for NSE, BSE, MCA, RBI, and investor-relations fallbacks
- Deterministic strategy evaluation helpers
- A small CLI demo that prints the official-source registry and sample strategy outputs

## Intended production flow

1. Fetch EOD and filing data from official/public-first adapters
2. Normalize into canonical payloads
3. Compute indicators, behavior scores, and strategy matches
4. Persist structured outputs to Supabase
5. Let the web layer explain those outputs without inventing numbers

## Next hardening steps

1. Build an NSE security-master worker that refreshes `core.companies`, `core.symbols`, and `core.company_search`.
2. Build daily EOD loaders for NSE and BSE that backfill `market.ohlcv_daily` in bulk instead of one symbol at a time.
3. Add a filing extractor that turns annual reports and disclosures into `fundamentals.business_notes`, yearly lines, and quarterly lines.
4. Add retry queues and dead-letter logging so failed symbols can be replayed without blocking the main batch.
5. Promote the current on-demand Yahoo Finance hydrator into a fallback path only, while official exchange loaders become the primary daily source.

## Security master refresh

You can now normalize and import official security-master CSV exports into Supabase:

```bash
cd workers
python -m stock_platform.cli security-master --input "C:\\path\\to\\nse-symbols.csv" --exchange NSE --push
python -m stock_platform.cli security-master --input "C:\\path\\to\\bse-symbols.csv" --exchange BSE --push
```

What this does:

1. Reads a CSV export from an official exchange source.
2. Normalizes company, sector, industry, ISIN, and symbol fields.
3. Pushes the batch into `public.app_refresh_security_master(...)`.
4. Updates `core.companies`, `core.symbols`, `core.company_search`, and admin run/job logs.

## Daily EOD market-data refresh

You can now normalize and import official daily EOD CSV exports into Supabase:

```bash
cd workers
python -m stock_platform.cli eod-market --input "C:\\path\\to\\nse-bhav.csv" --exchange NSE --price-date 2026-03-29 --push
python -m stock_platform.cli eod-market --input "C:\\path\\to\\bse-bhav.csv" --exchange BSE --price-date 2026-03-29 --push
```

What this does:

1. Reads an exchange EOD CSV export and normalizes symbol, date, OHLC, and volume fields.
2. Pushes the batch into `public.app_ingest_eod_market_data(...)`.
3. Upserts `market.ohlcv_daily` and writes any linked corporate-action payloads.
4. Recomputes the latest technical snapshot, trend state, price levels, and overview snapshot for touched companies.
5. Records source runs, ingestion jobs, ingestion logs, and unknown-symbol data-quality issues for replay and monitoring.

## Operational guidance

1. Refresh the security master before the first EOD import so symbols can be resolved to companies.
2. Run the EOD loader once per exchange after market close.
3. Treat the on-demand Yahoo hydrator as fallback only for symbols that still have no stored history.
4. Rerun the same file safely when needed because the market-data RPC is idempotent on `(company_id, price_date)`.

## Fundamentals refresh

You can now normalize and import fundamentals JSON batches into Supabase:

```bash
cd workers
python -m stock_platform.cli fundamentals --input "C:\\path\\to\\fundamentals.json" --exchange NSE --push
```

Expected input shape:

```json
[
  {
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "asOfDate": "2026-03-29",
    "yearlyFinancials": [
      {
        "period": "FY25",
        "revenueCr": 958410,
        "ebitdaCr": 164846.52,
        "patCr": 68047.11,
        "operatingCashFlowCr": 96500,
        "ebitdaMarginPct": 17.2,
        "patMarginPct": 7.1,
        "roePct": 10.6,
        "rocePct": 9.5,
        "netDebtToEbitda": 1.4
      }
    ],
    "quarterlyFinancials": [],
    "ratios": {
      "roePct": 10.9,
      "rocePct": 9.8,
      "ebitdaMarginPct": 17.6,
      "patMarginPct": 7.3,
      "netDebtToEbitda": 1.3,
      "peRatio": 24.6,
      "pbRatio": 2.1,
      "revenueGrowthPct": 8.1
    },
    "segmentMix": [{ "label": "Retail", "valuePct": 27, "asOfPeriod": "FY26E" }],
    "geographyMix": [{ "label": "India", "valuePct": 78, "asOfPeriod": "FY26E" }],
    "businessNotes": [
      {
        "sourceKind": "annual-report",
        "sourceUrl": "https://example.com",
        "note": "Retail growth recovered sequentially.",
        "sourceExcerpt": "Short cited excerpt"
      }
    ],
    "peerGroupSlug": "largecap-leaders",
    "peerGroupLabel": "Large Cap Leaders",
    "peerMembers": ["TCS", "INFY"]
  }
]
```

What this does:

1. Pushes yearly and quarterly lines into the fundamentals tables.
2. Upserts ratios, segment mix, geography mix, and business notes.
3. Maintains peer groups and peer memberships when provided.
4. Refreshes the latest fundamentals headline in the stock overview snapshot when possible.
5. Records source runs, ingestion jobs, logs, and unknown-symbol issues.

## Filing extraction pipeline format

This is the intermediate format for annual report, MCA, OCR, or parser outputs before they are pushed into the fundamentals importer.

Example template:

- [filing_extract_template.json](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\filing_extract_template.json)

Convert a filing extraction JSON file into the normalized fundamentals import shape:

```bash
cd workers
python -m stock_platform.cli filing-extract --input "C:\\path\\to\\annual-report-extract.json" --exchange NSE --output "C:\\path\\to\\fundamentals.normalized.json"
```

Convert and push directly to Supabase:

```bash
cd workers
python -m stock_platform.cli filing-extract --input "C:\\path\\to\\annual-report-extract.json" --exchange NSE --push
```

What this stage does:

1. Accepts extraction JSON from annual reports, MCA-derived outputs, or upstream parser jobs.
2. Normalizes yearly lines, quarterly lines, ratios, segment mix, geography mix, business notes, and peer hints.
3. Converts flexible aliases like `fiscalYear`, `segments`, `notes`, `sharePct`, and `excerpt` into the exact fundamentals import shape.
4. Produces a stable JSON contract that the `fundamentals` importer and Supabase RPC already understand.

Recommended pipeline:

1. Extract filing facts from PDF/XBRL/OCR into the filing extraction JSON format.
2. Run `filing-extract` to normalize that output into the fundamentals batch shape.
3. Review the normalized JSON for correctness.
4. Push the normalized payload with `filing-extract --push` or `fundamentals --push`.

## Source-specific extractors

These commands convert raw source-native extraction JSON into the intermediate filing extraction format and, if needed, all the way into the normalized fundamentals import shape.

Templates:

- [annual_report_extract_template.json](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\annual_report_extract_template.json)
- [mca_xbrl_extract_template.json](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\mca_xbrl_extract_template.json)
- [investor_presentation_extract_template.json](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\investor_presentation_extract_template.json)

Annual report extractor:

```bash
cd workers
python -m stock_platform.cli annual-report-extract --input "C:\\path\\to\\annual-report-raw.json" --output "C:\\path\\to\\annual-report.filing.json" --normalized-output "C:\\path\\to\\annual-report.fundamentals.json"
```

MCA/XBRL extractor:

```bash
cd workers
python -m stock_platform.cli mca-xbrl-extract --input "C:\\path\\to\\mca-xbrl-raw.json" --output "C:\\path\\to\\mca-xbrl.filing.json" --normalized-output "C:\\path\\to\\mca-xbrl.fundamentals.json"
```

Investor presentation extractor:

```bash
cd workers
python -m stock_platform.cli investor-presentation-extract --input "C:\\path\\to\\deck-raw.json" --output "C:\\path\\to\\deck.filing.json" --normalized-output "C:\\path\\to\\deck.fundamentals.json"
```

Direct push option:

```bash
cd workers
python -m stock_platform.cli annual-report-extract --input "C:\\path\\to\\annual-report-raw.json" --push
```

What these source-specific extractors do:

1. Accept source-native raw JSON shaped like annual report parser output, MCA/XBRL fact output, or investor presentation extraction output.
2. Convert those source-specific shapes into the common filing extraction contract.
3. Normalize that filing extraction contract into the exact fundamentals import contract.
4. Optionally push the normalized result directly into Supabase.

## Parser and orchestrator layer

The parser/orchestrator layer is the step that turns raw OCR text, raw XBRL JSON, or raw investor deck extraction text into source-specific raw extraction JSON automatically.

Single-document parsing:

```bash
cd workers
python -m stock_platform.cli parse-document --source-type annual-report-ocr --input "C:\\path\\to\\annual-report-ocr.txt" --symbol RELIANCE --exchange NSE --as-of-date 2026-03-29 --output "C:\\path\\to\\annual-report.raw.json"
python -m stock_platform.cli parse-document --source-type mca-xbrl-json --input "C:\\path\\to\\mca-xbrl.json" --symbol TCS --exchange NSE --output "C:\\path\\to\\mca.raw.json"
```

Manifest orchestration:

```bash
cd workers
python -m stock_platform.cli orchestrate-filings --manifest "C:\\Users\\ayush\\.gemini\\antigravity\\scratch\\perfectpick\\workers\\examples\\filing_parse_manifest.json"
```

Example raw parser inputs:

- [annual_report_ocr_sample.txt](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\annual_report_ocr_sample.txt)
- [mca_xbrl_extract_template.json](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\mca_xbrl_extract_template.json)
- [investor_presentation_ocr_sample.txt](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\investor_presentation_ocr_sample.txt)
- [filing_parse_manifest.json](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers\examples\filing_parse_manifest.json)

Current parser behavior:

1. `annual-report-ocr` uses heuristics over OCR/text/markdown content to extract periods, metrics, segment mix, geography mix, and note candidates.
2. `mca-xbrl-json` restructures raw XBRL-style JSON into the raw extraction contract.
3. `investor-presentation-ocr` uses heuristics over presentation OCR/text content to extract business and metric highlights.
4. `--ai-ocr` can be used on OCR-based inputs to ask Gemini to structure the text into raw extraction JSON when the heuristic parser is not enough.

Recommended orchestration flow:

1. Run OCR or document text extraction outside this step if the source is a PDF.
2. Run `parse-document` or `orchestrate-filings` to create raw extraction JSON files.
3. Run the source-specific extractor command or `filing-extract` to normalize those outputs.
4. Push the normalized payload into Supabase fundamentals tables.

## Document intake queue

The filing pipeline can now run as a proper intake queue backed by Supabase instead of only one-off CLI commands.

What is queued:

1. The original document path, usually a PDF.
2. An optional OCR sidecar path for OCR/text/markdown extracted from that PDF.
3. The parser source type, document kind, symbol, exchange, and optional output paths.
4. Per-document status in Supabase: `queued`, `processing`, `completed`, or `failed`.

Queue a document through the app API:

```json
POST /api/admin/ingestion/run
{
  "kind": "filing-document",
  "symbol": "RELIANCE",
  "exchange": "NSE",
  "documentKind": "annual-report",
  "parserSourceType": "annual-report-ocr",
  "inputPath": "C:\\path\\to\\Reliance-Annual-Report.pdf",
  "ocrPath": "C:\\path\\to\\Reliance-Annual-Report.ocr.txt",
  "outputPath": "C:\\path\\to\\Reliance-Annual-Report.raw.json",
  "normalizedOutputPath": "C:\\path\\to\\Reliance-Annual-Report.fundamentals.json",
  "metadata": {
    "asOfDate": "2026-03-29",
    "pushFundamentals": true
  }
}
```

How processing works:

1. The queue stores the original PDF/input path for traceability.
2. OCR-based jobs use `ocrPath` when present as the parse input, while keeping `inputPath` as the source document record.
3. XBRL JSON jobs parse `inputPath` directly.
4. The worker writes raw extraction JSON, normalized fundamentals JSON, and optionally pushes fundamentals into Supabase.
5. The queue updates status, timestamps, logs, and any failure message.

Run the queue worker:

```bash
cd workers
python -m stock_platform.cli process-filing-queue --limit 5
python -m stock_platform.cli process-filing-queue --limit 5 --ai-ocr
```

Use `--no-push` if you want to stop after producing raw and normalized JSON without writing fundamentals into Supabase:

```bash
cd workers
python -m stock_platform.cli process-filing-queue --limit 5 --no-push
```

Operational notes:

1. OCR jobs should usually supply both the original PDF path and the OCR sidecar path.
2. If `ocrPath` is missing for an OCR job, the worker will try to parse `inputPath` as text.
3. Admin monitoring now shows the filing queue so you can inspect queued, processing, completed, and failed documents.
4. Rerun `supabase/setup.sql` after pulling these changes so the new queue table, views, and RPCs exist.

## Automatic queue draining

You can now run the filing queue in two automatic modes instead of manually processing one batch at a time.

Drain everything currently queued:

```bash
cd workers
python -m stock_platform.cli drain-filing-queue --batch-limit 5 --max-batches 20
```

This keeps claiming new filing-document batches until the queue is empty or the batch cap is reached.

Run a long-lived polling worker:

```bash
cd workers
python -m stock_platform.cli run-filing-queue-worker --batch-limit 5 --max-batches-per-cycle 20 --poll-interval 60
```

How the polling worker behaves:

1. Claims and processes filing batches until the queue appears empty for that cycle.
2. Sleeps when there is no work.
3. Immediately continues processing when a cycle handled queued documents.
4. Prints JSON summaries per cycle so logs remain machine-readable.

Recommended Windows Task Scheduler setup:

1. The repo now ships an installer script, so you do not need to wire Task Scheduler by hand.
2. Run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\scripts\install-filing-queue-task.ps1" -Mode Drain -FrequencyMinutes 5
```

3. This creates a scheduled task named `PerfectPick Filing Queue` that repeatedly runs the checked-in queue runner script.
4. If you prefer a login-started long-running worker instead, run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\scripts\install-filing-queue-task.ps1" -Mode Worker
```

5. The underlying runner script is:

```powershell
C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\scripts\run-filing-queue.ps1
```

6. If you still want the raw worker command, it is:

```powershell
python -m stock_platform.cli drain-filing-queue --batch-limit 5 --max-batches 20
```

If you want a continuously running worker instead of scheduled drain runs, the script runs:

```powershell
python -m stock_platform.cli run-filing-queue-worker --batch-limit 5 --max-batches-per-cycle 20 --poll-interval 60
```

Operational recommendation:

1. Use `drain-filing-queue` for simple scheduled batch execution.
2. Use `run-filing-queue-worker` when you want a small always-on worker process.
3. Add `--ai-ocr` only when you are ready for OCR structuring calls to use Gemini.
