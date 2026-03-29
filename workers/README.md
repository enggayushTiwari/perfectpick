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
