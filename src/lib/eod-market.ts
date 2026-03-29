import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase";

export type EodMarketInputRecord = {
  symbol: string;
  exchange?: "NSE" | "BSE";
  priceDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
};

export async function refreshEodMarketData(records: EodMarketInputRecord[], options?: { exchange?: "NSE" | "BSE"; adapterKey?: string; adapterLabel?: string }) {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase service-role client is unavailable.");
  }

  const exchange = options?.exchange ?? "NSE";
  const adapterKey = options?.adapterKey ?? (exchange === "NSE" ? "nse_eod" : "bse_bhavcopy");
  const adapterLabel = options?.adapterLabel ?? (exchange === "NSE" ? "NSE EOD" : "BSE Bhav Copy");
  const timestamp = new Date().toISOString();

  const payload = {
    source: {
      adapterKey,
      adapterLabel,
      sourceType: "official",
      freshnessExpectation: "Daily after market close",
      exchange,
      startedAt: timestamp,
      finishedAt: timestamp,
      status: "healthy",
      detail: `Bulk EOD refresh accepted with ${records.length} records for ${exchange}.`
    },
    records: records.map((record) => ({
      exchange,
      source: adapterKey,
      ...record
    }))
  };

  const { data, error } = await client.rpc("app_ingest_eod_market_data", {
    payload
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
