import { NextResponse } from "next/server";
import { getAiExplanation } from "@/lib/ai";
import {
  getBehavior,
  getCorporateActions,
  getEvents,
  getFinancials,
  getFundamentals,
  getGeography,
  getNews,
  getOverview,
  getPatternCases,
  getPatterns,
  getPeers,
  getPrices,
  getScenarios,
  getSegments,
  getStrategies,
  getSupportResistance,
  getTechnicalIndicators,
  getTrendSummary
} from "@/lib/repositories";
import type { Period } from "@/lib/contracts";
import { ensureTickerHydrated, refreshTickerNewsEvents } from "@/lib/on-demand-ingestion";

type RouteContext = {
  params: Promise<{
    symbol: string;
    resource?: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { symbol, resource = [] } = await context.params;
  const path = resource.join("/");
  const { searchParams } = new URL(request.url);

  await ensureTickerHydrated(symbol, {
    force: searchParams.get("refresh") === "true"
  });

  const payload = await (async () => {
    switch (path) {
      case "":
      case "overview":
        return getOverview(symbol);
      case "ai-summary":
        return getAiExplanation(symbol, "summary");
      case "ai-fundamentals":
        return getAiExplanation(symbol, "fundamentals");
      case "ai-technicals":
        return getAiExplanation(symbol, "technicals");
      case "ai-strategies":
        return getAiExplanation(symbol, "strategies");
      case "fundamentals":
        return getFundamentals(symbol);
      case "financials":
        return getFinancials(symbol, (searchParams.get("period") as Period) || "yearly");
      case "segments":
        return getSegments(symbol);
      case "geography":
        return getGeography(symbol);
      case "peers":
        return getPeers(symbol);
      case "prices":
        return getPrices(symbol);
      case "technical-indicators":
        return getTechnicalIndicators(symbol);
      case "support-resistance":
        return getSupportResistance(symbol);
      case "corporate-actions":
        return getCorporateActions(symbol);
      case "trend-summary":
        return getTrendSummary(symbol);
      case "news":
        return getNews(symbol);
      case "events":
        return getEvents(symbol);
      case "behavior":
      case "momentum":
      case "volatility":
      case "market-sensitivity":
        return getBehavior(symbol);
      case "patterns":
        return getPatterns(symbol);
      case "patterns/similar-cases":
        return getPatternCases(symbol);
      case "strategy-evaluations":
        return getStrategies(symbol);
      case "scenarios":
        return getScenarios(symbol);
      default:
        return null;
    }
  })();

  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(payload);
}

export async function POST(request: Request, context: RouteContext) {
  const { symbol, resource = [] } = await context.params;
  const path = resource.join("/");

  if (path !== "hydrate" && path !== "news-refresh" && path !== "behavior-refresh") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { force?: boolean } = {};
  try {
    body = (await request.json()) as { force?: boolean };
  } catch {
    body = {};
  }

  const result =
    path === "news-refresh"
      ? await refreshTickerNewsEvents(symbol)
      : await ensureTickerHydrated(symbol, { force: body.force ?? true });
  const status = result.ingested ? 200 : 502;
  return NextResponse.json(result, { status });
}
