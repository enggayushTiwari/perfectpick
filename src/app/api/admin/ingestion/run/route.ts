import { NextResponse } from "next/server";
import { refreshEodMarketData, type EodMarketInputRecord } from "@/lib/eod-market";
import { ensureTickerHydrated } from "@/lib/on-demand-ingestion";
import { refreshSecurityMaster, type SecurityMasterInputRecord } from "@/lib/security-master";

export async function POST(request: Request) {
  let body:
    | { kind?: "ticker"; symbol?: string; force?: boolean }
    | { kind: "security-master"; exchange?: "NSE" | "BSE"; records?: SecurityMasterInputRecord[] }
    | { kind: "eod-market-data"; exchange?: "NSE" | "BSE"; records?: EodMarketInputRecord[] } = {};

  try {
    body = (await request.json()) as
      | { kind?: "ticker"; symbol?: string; force?: boolean }
      | { kind: "security-master"; exchange?: "NSE" | "BSE"; records?: SecurityMasterInputRecord[] }
      | { kind: "eod-market-data"; exchange?: "NSE" | "BSE"; records?: EodMarketInputRecord[] };
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

  if (!("symbol" in body) || !body.symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const result = await ensureTickerHydrated(body.symbol, {
    force: ("force" in body ? body.force : true) ?? true
  });

  return NextResponse.json(result, { status: result.ingested ? 200 : 502 });
}
