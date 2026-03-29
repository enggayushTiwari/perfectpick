import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase";

export type FundamentalsInputRecord = {
  symbol: string;
  exchange?: "NSE" | "BSE";
  asOfDate?: string;
  yearlyFinancials?: Array<{
    period: string;
    revenueCr?: number;
    ebitdaCr?: number;
    patCr?: number;
    operatingCashFlowCr?: number;
    filingSource?: string;
    ebitdaMarginPct?: number;
    patMarginPct?: number;
    roePct?: number;
    rocePct?: number;
    netDebtToEbitda?: number;
  }>;
  quarterlyFinancials?: Array<{
    period: string;
    revenueCr?: number;
    ebitdaCr?: number;
    patCr?: number;
    ebitdaMarginPct?: number;
    patMarginPct?: number;
    roePct?: number;
    rocePct?: number;
    netDebtToEbitda?: number;
  }>;
  ratios?: {
    roePct?: number;
    rocePct?: number;
    ebitdaMarginPct?: number;
    patMarginPct?: number;
    netDebtToEbitda?: number;
    peRatio?: number;
    pbRatio?: number;
    revenueGrowthPct?: number;
  };
  segmentMix?: Array<{
    label: string;
    valuePct: number;
    asOfPeriod?: string;
  }>;
  geographyMix?: Array<{
    label: string;
    valuePct: number;
    asOfPeriod?: string;
  }>;
  businessNotes?: Array<{
    sourceKind: string;
    sourceUrl?: string;
    note: string;
    sourceExcerpt?: string;
  }>;
  peerGroupSlug?: string;
  peerGroupLabel?: string;
  peerMembers?: string[];
};

export async function refreshFundamentals(
  records: FundamentalsInputRecord[],
  options?: { exchange?: "NSE" | "BSE"; adapterKey?: string; adapterLabel?: string }
) {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase service-role client is unavailable.");
  }

  const exchange = options?.exchange ?? "NSE";
  const adapterKey = options?.adapterKey ?? "mca_filings";
  const adapterLabel = options?.adapterLabel ?? "MCA Filings";
  const timestamp = new Date().toISOString();

  const payload = {
    source: {
      adapterKey,
      adapterLabel,
      sourceType: "official",
      freshnessExpectation: "Quarterly / filing-driven",
      exchange,
      startedAt: timestamp,
      finishedAt: timestamp,
      status: "healthy",
      detail: `Fundamentals refresh accepted with ${records.length} records for ${exchange}.`
    },
    records: records.map((record) => ({
      exchange,
      ...record
    }))
  };

  const { data, error } = await client.rpc("app_ingest_fundamentals_payload", {
    payload
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
