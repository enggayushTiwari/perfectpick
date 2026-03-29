import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase";

export type SecurityMasterInputRecord = {
  symbol: string;
  exchange?: "NSE" | "BSE";
  displayName: string;
  legalName?: string;
  isin?: string;
  sector?: string;
  sectorSlug?: string;
  industry?: string;
  industrySlug?: string;
  businessSummary?: string;
  websiteUrl?: string;
  irUrl?: string;
  slug?: string;
  isPrimary?: boolean;
};

export async function refreshSecurityMaster(records: SecurityMasterInputRecord[], options?: { exchange?: "NSE" | "BSE"; adapterKey?: string; adapterLabel?: string }) {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase service-role client is unavailable.");
  }

  const exchange = options?.exchange ?? "NSE";
  const adapterKey = options?.adapterKey ?? (exchange === "NSE" ? "nse_eod" : "bse_bhavcopy");
  const adapterLabel = options?.adapterLabel ?? (exchange === "NSE" ? "NSE Security Master" : "BSE Security Master");
  const timestamp = new Date().toISOString();

  const payload = {
    source: {
      adapterKey,
      adapterLabel,
      sourceType: "official",
      freshnessExpectation: "Daily directory refresh",
      exchange,
      startedAt: timestamp,
      finishedAt: timestamp,
      status: "healthy",
      detail: `Security master refresh accepted with ${records.length} records for ${exchange}.`
    },
    records: records.map((record) => ({
      exchange,
      isPrimary: true,
      ...record
    }))
  };

  const { data, error } = await client.rpc("app_refresh_security_master", {
    payload
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
