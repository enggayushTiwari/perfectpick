import { NextResponse } from "next/server";
import { refreshEodMarketData, type EodMarketInputRecord } from "@/lib/eod-market";
import { refreshFundamentals, type FundamentalsInputRecord } from "@/lib/fundamentals";
import { ensureTickerHydrated, refreshTickerNewsEvents } from "@/lib/on-demand-ingestion";
import { refreshSecurityMaster, type SecurityMasterInputRecord } from "@/lib/security-master";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  let body:
    | { kind?: "ticker"; symbol?: string; force?: boolean }
    | { kind: "security-master"; exchange?: "NSE" | "BSE"; records?: SecurityMasterInputRecord[] }
    | { kind: "eod-market-data"; exchange?: "NSE" | "BSE"; records?: EodMarketInputRecord[] }
    | { kind: "fundamentals"; exchange?: "NSE" | "BSE"; records?: FundamentalsInputRecord[] }
    | { kind: "news-events"; symbol?: string }
    | { kind: "behavior-context"; symbol?: string; force?: boolean }
    | {
        kind: "filing-document";
        symbol?: string;
        exchange?: "NSE" | "BSE";
        documentKind?: string;
        parserSourceType?: "annual-report-ocr" | "investor-presentation-ocr" | "mca-xbrl-json";
        inputPath?: string;
        ocrPath?: string;
        outputPath?: string;
        normalizedOutputPath?: string;
        metadata?: Record<string, unknown>;
      }
    | { kind: "phase0-audit"; staleAfterDays?: number }
    | { kind: "phase0-queue"; runDate?: string } = {};

  try {
    body = (await request.json()) as
      | { kind?: "ticker"; symbol?: string; force?: boolean }
      | { kind: "security-master"; exchange?: "NSE" | "BSE"; records?: SecurityMasterInputRecord[] }
      | { kind: "eod-market-data"; exchange?: "NSE" | "BSE"; records?: EodMarketInputRecord[] }
      | { kind: "fundamentals"; exchange?: "NSE" | "BSE"; records?: FundamentalsInputRecord[] }
      | { kind: "news-events"; symbol?: string }
      | { kind: "behavior-context"; symbol?: string; force?: boolean }
      | {
          kind: "filing-document";
          symbol?: string;
          exchange?: "NSE" | "BSE";
          documentKind?: string;
          parserSourceType?: "annual-report-ocr" | "investor-presentation-ocr" | "mca-xbrl-json";
          inputPath?: string;
          ocrPath?: string;
          outputPath?: string;
          normalizedOutputPath?: string;
          metadata?: Record<string, unknown>;
        }
      | { kind: "phase0-audit"; staleAfterDays?: number }
      | { kind: "phase0-queue"; runDate?: string };
  } catch {
    body = {};
  }

  if (body.kind === "security-master") {
    if (!body.records?.length) {
      return NextResponse.json({ error: "records are required for security-master refresh" }, { status: 400 });
    }

    const result = await refreshSecurityMaster(body.records, {
      exchange: body.exchange ?? "NSE"
    });

    return NextResponse.json({ refreshed: true, result });
  }

  if (body.kind === "eod-market-data") {
    if (!body.records?.length) {
      return NextResponse.json({ error: "records are required for eod-market-data refresh" }, { status: 400 });
    }

    const result = await refreshEodMarketData(body.records, {
      exchange: body.exchange ?? "NSE"
    });

    return NextResponse.json({ refreshed: true, result });
  }

  if (body.kind === "fundamentals") {
    if (!body.records?.length) {
      return NextResponse.json({ error: "records are required for fundamentals refresh" }, { status: 400 });
    }

    const result = await refreshFundamentals(body.records, {
      exchange: body.exchange ?? "NSE"
    });

    return NextResponse.json({ refreshed: true, result });
  }

  if (body.kind === "news-events") {
    if (!body.symbol) {
      return NextResponse.json({ error: "symbol is required for news-events refresh" }, { status: 400 });
    }

    const result = await refreshTickerNewsEvents(body.symbol);
    return NextResponse.json(result, { status: result.ingested ? 200 : 502 });
  }

  if (body.kind === "behavior-context") {
    if (!body.symbol) {
      return NextResponse.json({ error: "symbol is required for behavior-context refresh" }, { status: 400 });
    }

    const result = await ensureTickerHydrated(body.symbol, {
      force: body.force ?? true
    });
    return NextResponse.json(result, { status: result.ingested ? 200 : 502 });
  }

  if (body.kind === "filing-document") {
    if (!body.symbol || !body.inputPath || !body.parserSourceType || !body.documentKind) {
      return NextResponse.json(
        { error: "symbol, inputPath, parserSourceType, and documentKind are required for filing-document intake" },
        { status: 400 }
      );
    }

    const client = createSupabaseAdminClient();
    if (!client) {
      return NextResponse.json({ error: "Supabase service-role client is unavailable." }, { status: 500 });
    }

    const { data, error } = await client.rpc("app_queue_filing_document", {
      payload: {
        adapterKey: body.parserSourceType === "investor-presentation-ocr" ? "investor_relations" : "mca_filings",
        adapterLabel: body.parserSourceType === "investor-presentation-ocr" ? "Investor Relations" : "MCA Filings",
        sourceType: body.parserSourceType === "investor-presentation-ocr" ? "public" : "official",
        freshnessExpectation: "Filing-driven",
        symbol: body.symbol,
        exchange: body.exchange ?? "NSE",
        documentKind: body.documentKind,
        parserSourceType: body.parserSourceType,
        inputPath: body.inputPath,
        ocrPath: body.ocrPath,
        outputPath: body.outputPath,
        normalizedOutputPath: body.normalizedOutputPath,
        metadata: body.metadata ?? {}
      }
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ queued: true, result: data }, { status: 202 });
  }

  if (body.kind === "phase0-audit") {
    const client = createSupabaseAdminClient();
    if (!client) {
      return NextResponse.json({ error: "Supabase service-role client is unavailable." }, { status: 500 });
    }

    const { data, error } = await client.rpc("app_run_freshness_audit", {
      stale_after_days: body.staleAfterDays ?? 5
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ audited: true, result: data });
  }

  if (body.kind === "phase0-queue") {
    const client = createSupabaseAdminClient();
    if (!client) {
      return NextResponse.json({ error: "Supabase service-role client is unavailable." }, { status: 500 });
    }

    const { data, error } = await client.rpc("app_queue_daily_refresh", {
      run_date: body.runDate ?? new Date().toISOString().slice(0, 10)
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ queued: true, result: data }, { status: 202 });
  }

  if (!("symbol" in body) || !body.symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const result = await ensureTickerHydrated(body.symbol, {
    force: ("force" in body ? body.force : true) ?? true
  });

  return NextResponse.json(result, { status: result.ingested ? 200 : 502 });
}
