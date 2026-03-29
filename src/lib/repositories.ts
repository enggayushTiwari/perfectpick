import {
  featuredPatterns,
  learnGlossary,
  stockBundles
} from "@/lib/demo-data";
import type {
  CorporateAction,
  BehaviorScore,
  BehaviorSnapshot,
  CompanySummary,
  DataQualityIssue,
  EventItem,
  FinancialLine,
  FilingDocument,
  FundamentalsSnapshot,
  IngestionJob,
  AdminOverview,
  MetricCard,
  BusinessNote,
  NewsArticle,
  PatternMatch,
  PeerRow,
  Period,
  PriceLevel,
  PricePoint,
  SearchResult,
  StaleSymbol,
  SourceRun,
  Scenario,
  SourceStatus,
  StockBundle,
  StrategyEvaluation,
  TechnicalIndicator
} from "@/lib/contracts";
import { ensureTickerHydrated } from "@/lib/on-demand-ingestion";
import { createSupabaseReadClient } from "@/lib/supabase";

type LiveDirectoryRow = {
  company_id: string;
  slug: string;
  company_name: string;
  summary: string | null;
  sector: string;
  industry: string;
  exchange: "NSE" | "BSE";
  symbol: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type LiveOverviewRow = LiveDirectoryRow & {
  snapshot_date: string | null;
  close: number | null;
  day_change_pct: number | null;
  market_cap_cr: number | null;
  one_year_return_pct: number | null;
  fundamentals_headline: string | null;
  technical_summary: string | null;
  technical_events: unknown;
  behavior_narrative: string | null;
  summary_tags: unknown;
  base_tags: string[] | null;
};

type LiveSourceStatusRow = {
  adapter: string;
  status: string;
  note: string;
  freshness: string;
};

type LiveSourceRunRow = {
  id: string;
  adapter: string;
  source_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  detail: string | null;
};

type LiveDataQualityIssueRow = {
  id: string;
  adapter: string;
  issue_type: string;
  detail: string;
  resolved: boolean;
  created_at: string;
};

type LiveAdminOverviewRow = {
  total_sources: number;
  healthy_sources: number;
  warning_sources: number;
  degraded_sources: number;
  stale_sources: number;
  total_jobs: number;
  running_jobs: number;
  queued_jobs: number;
  warning_jobs: number;
  success_jobs: number;
  open_issues: number;
  resolved_issues: number;
  latest_run_started_at: string | null;
  latest_activity_at: string | null;
};

type LiveStaleSymbolRow = {
  company_id: string;
  company_name: string;
  exchange: "NSE" | "BSE";
  symbol: string;
  snapshot_date: string | null;
  snapshot_age_days: number | null;
  status: "missing" | "stale";
  note: string;
};

type LiveFilingDocumentRow = {
  id: string;
  source: string;
  symbol: string;
  exchange: "NSE" | "BSE";
  source_type: string;
  document_kind: string;
  status: "queued" | "processing" | "completed" | "failed";
  input_path: string | null;
  ocr_path: string | null;
  output_path: string | null;
  normalized_output_path: string | null;
  error_message: string | null;
  queued_at: string;
  processing_started_at: string | null;
  processing_finished_at: string | null;
};

type LiveFinancialRow = {
  symbol: string;
  period: string;
  revenue_cr: number | null;
  ebitda_margin_pct: number | null;
  pat_margin_pct: number | null;
  roe_pct: number | null;
  roce_pct: number | null;
  net_debt_to_ebitda: number | null;
};

type LiveMixRow = {
  symbol: string;
  as_of_period: string;
  label: string;
  value_pct: number;
};

type LiveBusinessNoteRow = {
  id: string;
  source_kind: string;
  source_url: string | null;
  symbol: string;
  note: string;
  source_excerpt: string | null;
  created_at: string;
};

type LivePeerRow = {
  basis_symbol: string;
  symbol: string;
  company_name: string;
  market_cap_cr: number | null;
  pe_ratio: number | null;
  roe_pct: number | null;
  revenue_growth_pct: number | null;
  one_year_return_pct: number | null;
};

type LivePriceRow = {
  symbol: string;
  price_date: string;
  close: number;
  volume: number;
};

type LiveTechnicalSnapshotRow = {
  symbol: string;
  price_date: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd: number | null;
  atr_14: number | null;
  vwap: number | null;
  trend_state: string | null;
  technical_summary: string | null;
  technical_events: unknown;
};

type LivePriceLevelRow = {
  symbol: string;
  as_of_date: string;
  label: string;
  value: number;
  reason: string | null;
};

type LiveCorporateActionRow = {
  symbol: string;
  id: string;
  action_type: string;
  action_date: string;
  details: Record<string, unknown> | null;
};

type LiveNewsRow = {
  symbol: string;
  id: string;
  headline: string;
  source_name: string;
  published_at: string;
  relevance: "high" | "medium" | "low" | null;
  impact_score: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  why_it_matters: string | null;
  summary: string | null;
  canonical_url: string | null;
  entities: unknown;
};

type LiveEventRow = {
  symbol: string;
  id: string;
  event_title: string;
  event_type: string;
  event_date: string;
  note: string | null;
};

type LiveBehaviorRow = {
  symbol: string;
  price_date: string;
  regime_label: string | null;
  macro_regime: string | null;
  narrative: string | null;
  market_context_summary: string | null;
  benchmark_symbol: string | null;
  benchmark_return_pct: number | null;
  relative_strength_pct: number | null;
  context_signals: unknown;
  momentum_sensitivity: number | null;
  acceleration_score: number | null;
  trend_decay_score: number | null;
  volatility_sensitivity: number | null;
  market_linkage_score: number | null;
};

type LiveStrategyRow = {
  symbol: string;
  id: string;
  category: string | null;
  evaluation_date: string;
  strategy_name: string;
  matched: boolean;
  confidence_pct: number;
  source_snapshot_date: string | null;
  matched_rule_count: number | null;
  total_rule_count: number | null;
  support_quality: "strong" | "moderate" | "weak" | null;
  provenance_note: string | null;
  support_points: unknown;
  invalidation: string | null;
  explanation: string | null;
};

type LiveScenarioRow = {
  symbol: string;
  id: string;
  evaluation_date: string;
  stance: "Bullish" | "Neutral" | "Bearish";
  title: string;
  confidence_pct: number;
  source_snapshot_date: string | null;
  provenance_note: string | null;
  trigger_condition: string | null;
  invalidation: string | null;
  payoff_frame: string | null;
  explanation: string | null;
};

type LivePatternRow = {
  symbol: string;
  id: string;
  pattern_name: string;
  confidence_pct: number;
  note: string | null;
  similar_cases: unknown;
};

type LiveIngestionJobRow = {
  id: string;
  source: string;
  target_table: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  note: string | null;
};

function lookupBundle(symbol: string) {
  return stockBundles[symbol.toUpperCase()];
}

function asNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function asPct(value: number | null | undefined) {
  return value === null || value === undefined ? null : `${value.toFixed(1)}%`;
}

function asMultiple(value: number | null | undefined) {
  return value === null || value === undefined ? null : `${value.toFixed(1)}x`;
}

function inferTone(value: number | null | undefined, positiveThreshold: number, cautionThreshold: number = 0) {
  if (value === null || value === undefined) {
    return "neutral" as const;
  }

  if (value >= positiveThreshold) {
    return "positive" as const;
  }

  if (value <= cautionThreshold) {
    return "caution" as const;
  }

  return "neutral" as const;
}

function buildLiveOverview(live?: LiveOverviewRow | LiveDirectoryRow | null): CompanySummary | null {
  if (!live) {
    return null;
  }

  return {
    symbol: live.symbol,
    companyName: live.company_name,
    exchange: live.exchange,
    sector: live.sector,
    industry: live.industry,
    summary: live.summary || "Company metadata is live, but deeper analytics have not been loaded yet.",
    tags: live.tags?.length ? live.tags : [live.sector],
    lastUpdated: ("snapshot_date" in live ? live.snapshot_date : live.updated_at)?.slice(0, 10) ?? live.updated_at.slice(0, 10),
    close: "close" in live ? asNumber(live.close, 0) : 0,
    dayChangePct: "day_change_pct" in live ? asNumber(live.day_change_pct, 0) : 0,
    marketCapCr: "market_cap_cr" in live ? asNumber(live.market_cap_cr, 0) : 0
  };
}

function buildSkeletonBundle(overview: CompanySummary): StockBundle {
  return {
    overview,
    fundamentals: {
      headline: "Live company metadata is available. Fundamentals will populate once financial loaders run.",
      liveStatus: "missing",
      asOfDate: undefined,
      metricCards: [],
      yearly: [],
      quarterly: [],
      segmentMix: [],
      geographyMix: [],
      peerComparison: [],
      businessNotes: [],
      filingNotes: []
    },
    technicals: {
      liveStatus: "missing",
      asOfDate: undefined,
      trendState: "Awaiting analytics load",
      summary: "Technical snapshots will appear after EOD market data and indicators are loaded.",
      indicators: [],
      prices: [],
      supportResistance: [],
      events: []
    },
    news: [],
    events: [],
    behavior: {
      liveStatus: "missing",
      asOfDate: undefined,
      regimeLabel: "Awaiting analytics load",
      macroRegime: "Awaiting market-context load",
      narrative: "Behavior metrics will appear after the analytics worker writes the first daily snapshot.",
      marketContextSummary: "Benchmark-relative and macro-context overlays will appear after the analytics worker writes them.",
      contextSignals: [],
      scores: []
    },
    strategies: [],
    scenarios: [],
    patterns: []
  };
}

function toBusinessNotes(rows: LiveBusinessNoteRow[]): BusinessNote[] {
  return rows.map((row) => ({
    id: row.id,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url ?? undefined,
    note: row.note,
    sourceExcerpt: row.source_excerpt ?? undefined,
    createdAt: row.created_at
  }));
}

function buildMissingTechnicals(symbol: string, overview?: LiveOverviewRow | LiveDirectoryRow | null) {
  const technicalSummary = overview && "technical_summary" in overview ? overview.technical_summary : null;
  return {
    liveStatus: "missing" as const,
    asOfDate: undefined,
    trendState: "Awaiting analytics load",
    summary:
      technicalSummary ||
      `Structured EOD prices and technical indicators are not loaded yet for ${symbol.toUpperCase()}. Run the daily market-data loader to populate charts and trend states.`,
    indicators: [],
    prices: [],
    supportResistance: [],
    events: []
  };
}

function buildMissingFundamentals(symbol: string, overview?: LiveOverviewRow | LiveDirectoryRow | null): FundamentalsSnapshot {
  const overviewHeadline = overview && "fundamentals_headline" in overview ? overview.fundamentals_headline : null;
  return {
    headline:
      overviewHeadline ||
      `Structured fundamentals are not loaded yet for ${symbol.toUpperCase()}. Queue annual-report, MCA/XBRL, or investor-presentation documents to populate this tab.`,
    liveStatus: "missing",
    asOfDate: undefined,
    metricCards: [],
    yearly: [],
    quarterly: [],
    segmentMix: [],
    geographyMix: [],
    peerComparison: [],
    businessNotes: [],
    filingNotes: []
  };
}

function buildMissingBehavior(symbol: string): BehaviorSnapshot {
  return {
    liveStatus: "missing",
    asOfDate: undefined,
    regimeLabel: "Awaiting analytics load",
    macroRegime: "Awaiting market-context load",
    narrative: `Structured behavior analytics are not loaded yet for ${symbol.toUpperCase()}. Run the daily analytics refresh to populate momentum, volatility, and market-context signals.`,
    marketContextSummary:
      "Relative-strength, benchmark, and macro-context overlays have not been computed yet for this symbol.",
    contextSignals: [],
    scores: []
  };
}

function normalizeSourceStatus(status: string): SourceStatus["status"] {
  if (status === "healthy" || status === "warning" || status === "degraded") {
    return status;
  }

  if (status === "success") {
    return "healthy";
  }

  return "warning";
}

function normalizeJobStatus(status: string): IngestionJob["status"] {
  if (status === "queued" || status === "running" || status === "success" || status === "warning") {
    return status;
  }

  if (status === "healthy") {
    return "success";
  }

  return "warning";
}

function normalizeRelevance(value: string | null | undefined): NewsArticle["relevance"] {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "medium";
}

function normalizeSentiment(value: string | null | undefined): NewsArticle["sentiment"] {
  if (value === "positive" || value === "neutral" || value === "negative") {
    return value;
  }

  return "neutral";
}

function toNewsEntities(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entity = item as Record<string, unknown>;
      const entityType = typeof entity.entityType === "string" ? entity.entityType.trim() : "";
      const entityName = typeof entity.entityName === "string" ? entity.entityName.trim() : "";
      const relevanceScore =
        typeof entity.relevanceScore === "number"
          ? entity.relevanceScore
          : typeof entity.relevanceScore === "string" && entity.relevanceScore.trim()
            ? Number(entity.relevanceScore)
            : undefined;

      if (!entityType || !entityName) {
        return null;
      }

      return {
        entityType,
        entityName,
        relevanceScore: relevanceScore !== undefined && Number.isFinite(relevanceScore) ? relevanceScore : undefined
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function parsePeriodOrder(period: string, kind: Period) {
  const yearMatch = period.match(/FY(\d{2})/i);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const quarterMatch = period.match(/Q(\d)/i);
  const quarter = quarterMatch ? Number(quarterMatch[1]) : kind === "quarterly" ? 0 : 9;
  const estimateWeight = /E$/i.test(period.trim()) ? 0.5 : 0;

  return year * 10 + quarter + estimateWeight;
}

function sortFinancialLines(rows: FinancialLine[], kind: Period) {
  return [...rows].sort((left, right) => parsePeriodOrder(left.period, kind) - parsePeriodOrder(right.period, kind));
}

function buildMetricCardsFromLive(yearly: FinancialLine[], peers: PeerRow[], symbol: string): MetricCard[] {
  const latest = yearly.at(-1);
  if (!latest) {
    return [];
  }

  const selfPeer = peers.find((peer) => peer.symbol === symbol.toUpperCase());
  const revenueGrowth = selfPeer?.revenueGrowthPct;
  const cards: MetricCard[] = [];

  if (revenueGrowth !== undefined) {
    cards.push({
      label: "Revenue Growth",
      value: `${revenueGrowth.toFixed(1)}%`,
      hint: "Latest peer-model revenue growth view.",
      tone: inferTone(revenueGrowth, 8)
    });
  }

  cards.push({
    label: "EBITDA Margin",
    value: asPct(latest.ebitdaMarginPct) ?? "NA",
    hint: "Latest yearly margin snapshot.",
    tone: inferTone(latest.ebitdaMarginPct, 18)
  });
  cards.push({
    label: "ROE",
    value: asPct(latest.roePct) ?? "NA",
    hint: "Return on equity from the latest yearly line.",
    tone: inferTone(latest.roePct, 18)
  });
  cards.push({
    label: latest.netDebtToEbitda < 0 ? "Net Cash" : "Net Debt / EBITDA",
    value: latest.netDebtToEbitda < 0 ? "Net cash" : asMultiple(latest.netDebtToEbitda) ?? "NA",
    hint:
      latest.netDebtToEbitda < 0
        ? `${Math.abs(latest.netDebtToEbitda).toFixed(1)}x surplus vs debt.`
        : "Balance-sheet leverage framing.",
    tone: latest.netDebtToEbitda <= 0 ? "positive" : inferTone(-(latest.netDebtToEbitda ?? 0), -1)
  });
  cards.push({
    label: "ROCE",
    value: asPct(latest.rocePct) ?? "NA",
    hint: "Capital efficiency from the latest yearly line.",
    tone: inferTone(latest.rocePct, 15)
  });
  cards.push({
    label: "PAT Margin",
    value: asPct(latest.patMarginPct) ?? "NA",
    hint: "Bottom-line profitability snapshot.",
    tone: inferTone(latest.patMarginPct, 8)
  });

  return cards;
}

function toFinancialLines(rows: LiveFinancialRow[], kind: Period) {
  return sortFinancialLines(
    rows.map(
      (row): FinancialLine => ({
        period: row.period,
        revenueCr: asNumber(row.revenue_cr),
        ebitdaMarginPct: asNumber(row.ebitda_margin_pct),
        patMarginPct: asNumber(row.pat_margin_pct),
        roePct: asNumber(row.roe_pct),
        rocePct: asNumber(row.roce_pct),
        netDebtToEbitda: asNumber(row.net_debt_to_ebitda)
      })
    ),
    kind
  );
}

function toRevenueSplits(rows: LiveMixRow[]) {
  return rows
    .map((row) => ({
      label: row.label,
      valuePct: asNumber(row.value_pct)
    }))
    .sort((left, right) => right.valuePct - left.valuePct);
}

function toPeerRows(rows: LivePeerRow[], basisSymbol: string) {
  return rows
    .filter((row) => row.basis_symbol === basisSymbol.toUpperCase())
    .map(
      (row): PeerRow => ({
        symbol: row.symbol,
        companyName: row.company_name,
        marketCapCr: asNumber(row.market_cap_cr),
        pe: asNumber(row.pe_ratio),
        roe: asNumber(row.roe_pct),
        revenueGrowthPct: asNumber(row.revenue_growth_pct),
        oneYearReturnPct: asNumber(row.one_year_return_pct)
      })
    )
    .sort((left, right) => right.marketCapCr - left.marketCapCr);
}

function toPricePoints(rows: LivePriceRow[]) {
  return rows
    .map(
      (row): PricePoint => ({
        date: row.price_date,
        close: asNumber(row.close),
        volume: asNumber(row.volume)
      })
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildTechnicalIndicators(row: LiveTechnicalSnapshotRow | null, close: number) {
  if (!row) {
    return null;
  }

  const indicators: TechnicalIndicator[] = [];

  if (row.sma_20 !== null) {
    indicators.push({
      name: "20DMA",
      value: row.sma_20.toFixed(1),
      interpretation:
        close >= row.sma_20
          ? "Price is holding above the short-term trend line."
          : "Price is below the short-term trend line and needs recovery.",
      tone: close >= row.sma_20 ? "positive" : "caution"
    });
  }

  if (row.sma_50 !== null) {
    indicators.push({
      name: "50DMA",
      value: row.sma_50.toFixed(1),
      interpretation:
        close >= row.sma_50
          ? "Intermediate trend remains constructive."
          : "Intermediate trend support is being tested.",
      tone: close >= row.sma_50 ? "positive" : "caution"
    });
  }

  if (row.sma_200 !== null) {
    indicators.push({
      name: "200DMA",
      value: row.sma_200.toFixed(1),
      interpretation:
        close >= row.sma_200
          ? "Long-term structure is still intact."
          : "Long-term trend support is under pressure.",
      tone: close >= row.sma_200 ? "positive" : "caution"
    });
  }

  if (row.rsi_14 !== null) {
    indicators.push({
      name: "RSI (14)",
      value: row.rsi_14.toFixed(1),
      interpretation:
        row.rsi_14 >= 60
          ? "Momentum is firm without obvious exhaustion yet."
          : row.rsi_14 >= 50
            ? "Momentum is constructive but measured."
            : "Momentum remains muted and needs confirmation.",
      tone: row.rsi_14 >= 55 ? "positive" : row.rsi_14 < 45 ? "caution" : "neutral"
    });
  }

  if (row.macd !== null) {
    indicators.push({
      name: "MACD",
      value: row.macd >= 0 ? `+${row.macd.toFixed(1)}` : row.macd.toFixed(1),
      interpretation:
        row.macd >= 0
          ? "Momentum line remains supportive of continuation."
          : "Momentum still needs improvement to turn constructive.",
      tone: row.macd >= 0 ? "positive" : "caution"
    });
  }

  if (row.atr_14 !== null) {
    indicators.push({
      name: "ATR",
      value: row.atr_14.toFixed(1),
      interpretation: "Volatility framing helps size risk around the current structure.",
      tone: "neutral"
    });
  }

  return indicators;
}

function describeRegime(scores: Record<string, number>) {
  if (scores.momentum >= 60 && scores.acceleration >= 55 && scores.trendDecay <= 40) {
    return "Trend-following";
  }

  if (scores.volatility >= 65) {
    return "High-volatility";
  }

  if (scores.marketLinkage >= 60) {
    return "Market-linked";
  }

  if (scores.momentum <= 45 && scores.trendDecay >= 55) {
    return "Cooling";
  }

  return "Balanced";
}

function buildBehaviorSignals(scores: Record<string, number>) {
  const signals: string[] = [];

  signals.push(
    scores.momentum >= 60
      ? "Momentum response is firm when the stock starts trending."
      : scores.momentum <= 45
        ? "Momentum follow-through is still muted."
        : "Momentum behavior is constructive but not aggressive."
  );

  signals.push(
    scores.acceleration >= 55
      ? "Recent price slope is steepening rather than flattening."
      : "Acceleration is measured, so trend continuation may stay slower."
  );

  signals.push(
    scores.trendDecay <= 35
      ? "Trend decay is contained, which supports persistence."
      : scores.trendDecay >= 55
        ? "Trend decay is elevated, so continuation needs more confirmation."
        : "Trend decay is present but not yet dominant."
  );

  signals.push(
    scores.volatility >= 60
      ? "Volatility shocks can move this stock quickly, so risk framing should stay wide."
      : "Volatility sensitivity remains relatively contained."
  );

  signals.push(
    scores.marketLinkage >= 60
      ? "Broader market direction is still explaining a meaningful part of the move."
      : "Company-specific behavior is carrying more of the tape than index beta alone."
  );

  return signals;
}

function buildMarketContextSummary(
  benchmarkSymbol: string | null,
  benchmarkReturnPct: number | null,
  relativeStrengthPct: number | null,
  macroRegime: string | null
) {
  const benchmarkLabel = benchmarkSymbol || "^NSEI";
  const benchmarkText =
    benchmarkReturnPct === null
      ? `${benchmarkLabel} context is not stored yet.`
      : `${benchmarkLabel} is ${benchmarkReturnPct >= 0 ? "up" : "down"} ${Math.abs(benchmarkReturnPct).toFixed(1)}% over the recent lookback window.`;
  const relativeText =
    relativeStrengthPct === null
      ? "Relative strength versus the benchmark is still unavailable."
      : relativeStrengthPct >= 0
        ? `The stock is outperforming that benchmark by ${relativeStrengthPct.toFixed(1)} percentage points.`
        : `The stock is lagging that benchmark by ${Math.abs(relativeStrengthPct).toFixed(1)} percentage points.`;

  return `${macroRegime || "Market context is not classified yet."} ${benchmarkText} ${relativeText}`;
}

function toBehaviorSnapshot(row: LiveBehaviorRow | null): BehaviorSnapshot | null {
  if (!row) {
    return null;
  }

  const numericScores = {
    momentum: asNumber(row.momentum_sensitivity),
    acceleration: asNumber(row.acceleration_score),
    trendDecay: asNumber(row.trend_decay_score),
    volatility: asNumber(row.volatility_sensitivity),
    marketLinkage: asNumber(row.market_linkage_score)
  };

  const scores: BehaviorScore[] = [
    {
      label: "Momentum Sensitivity",
      value: numericScores.momentum,
      interpretation: "Tracks how strongly the stock tends to respond when momentum improves."
    },
    {
      label: "Acceleration",
      value: numericScores.acceleration,
      interpretation: "Measures how quickly the recent trend slope is steepening."
    },
    {
      label: "Trend Decay",
      value: numericScores.trendDecay,
      interpretation: "Higher values mean the existing trend is losing strength faster."
    },
    {
      label: "Volatility Sensitivity",
      value: numericScores.volatility,
      interpretation: "Shows how fragile the price path looks during volatility spikes."
    },
    {
      label: "Market Linkage",
      value: numericScores.marketLinkage,
      interpretation: "Captures how much broader market direction is explaining the move."
    }
  ];

  const populatedScoreCount = Object.values(numericScores).filter((value) => value > 0).length;
  const storedSignals = asStringArray(row.context_signals);
  const macroContextAvailable =
    Boolean(row.regime_label) ||
    Boolean(row.macro_regime) ||
    Boolean(row.market_context_summary) ||
    row.benchmark_return_pct !== null ||
    row.relative_strength_pct !== null ||
    storedSignals.length > 0;

  return {
    asOfDate: row.price_date,
    liveStatus: populatedScoreCount >= 5 && macroContextAvailable ? "live" : "partial",
    regimeLabel: row.regime_label || describeRegime(numericScores),
    macroRegime: row.macro_regime || "Market context is not classified yet",
    narrative: row.narrative || "Behavior metrics are live, but the descriptive narrative is still sparse.",
    marketContextSummary:
      row.market_context_summary ||
      buildMarketContextSummary(
        row.benchmark_symbol,
        row.benchmark_return_pct,
        row.relative_strength_pct,
        row.macro_regime
      ),
    benchmarkSymbol: row.benchmark_symbol ?? undefined,
    benchmarkReturnPct: row.benchmark_return_pct ?? undefined,
    relativeStrengthPct: row.relative_strength_pct ?? undefined,
    contextSignals: storedSignals.length ? storedSignals : buildBehaviorSignals(numericScores),
    scores
  };
}

async function getLiveClient() {
  return createSupabaseReadClient();
}

async function selectRows<T>(
  view: string,
  options?: {
    symbol?: string;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    filters?: Array<{ column: string; value: string | number | boolean }>;
  }
) {
  const client = await getLiveClient();
  if (!client) {
    return null;
  }

  let query = client.from(view).select("*");

  if (options?.symbol) {
    query = query.eq("symbol", options.symbol.toUpperCase());
  }

  for (const filter of options?.filters ?? []) {
    query = query.eq(filter.column, filter.value);
  }

  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? true });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error || !data) {
    return null;
  }

  return data as T[];
}

async function selectSingle<T>(view: string, symbol: string) {
  const client = await getLiveClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from(view)
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as T;
}

async function getLiveDirectoryRows(query?: string) {
  const client = await getLiveClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.rpc("app_search_companies", {
    search_query: query?.trim() ? query : null
  });

  if (error || !data) {
    return null;
  }

  return data as LiveDirectoryRow[];
}

async function getLiveOverview(symbol: string) {
  const overview = await selectSingle<LiveOverviewRow>("app_stock_overview", symbol);
  if (overview) {
    return overview;
  }

  return selectSingle<LiveDirectoryRow>("app_company_directory", symbol);
}

export async function getSearchResults(query = "") {
  const liveRows = await getLiveDirectoryRows(query);

  if (liveRows?.length) {
    return liveRows.map(
      (row): SearchResult => ({
        symbol: row.symbol,
        companyName: row.company_name,
        sector: row.sector,
        exchange: row.exchange,
        tags: row.tags?.length ? row.tags : [row.sector]
      })
    );
  }

  return [];
}

export async function getMarketSummary() {
  const [companies, sources] = await Promise.all([getSearchResults(), getSourceStatuses()]);

  const healthyCount = sources.filter((source) => source.status === "healthy").length;
  return {
    lastUpdated: new Date().toISOString().slice(0, 10),
    headline: `${companies.length} listed companies are currently visible through the live public app layer.`,
    breadth: `${healthyCount} configured source adapters are currently reporting healthy status.`,
    leaders: companies.slice(0, 3).map((company) => company.companyName),
    caution:
      companies.length === 0
        ? "No live company rows are visible yet. Refresh the security master to populate the searchable universe."
        : "Phase 0 surfaces are live-only. Deeper tabs can still use fallback until later phases are fully loaded."
  };
}

export async function getOverview(symbol: string) {
  const live = await getLiveOverview(symbol);
  return buildLiveOverview(live);
}

export async function getFinancials(symbol: string, period: Period) {
  const view = period === "quarterly" ? "app_financials_quarterly" : "app_financials_yearly";
  const liveRows = await selectRows<LiveFinancialRow>(view, { symbol });

  if (liveRows?.length) {
    return toFinancialLines(liveRows, period);
  }

  return [];
}

export async function getSegments(symbol: string) {
  const liveRows = await selectRows<LiveMixRow>("app_segment_mix", { symbol });

  if (liveRows?.length) {
    return toRevenueSplits(liveRows);
  }

  return [];
}

export async function getGeography(symbol: string) {
  const liveRows = await selectRows<LiveMixRow>("app_geography_mix", { symbol });

  if (liveRows?.length) {
    return toRevenueSplits(liveRows);
  }

  return [];
}

export async function getPeers(symbol: string) {
  const liveRows = await selectRows<LivePeerRow>("app_peer_comparison", {
    filters: [{ column: "basis_symbol", value: symbol.toUpperCase() }]
  });

  if (liveRows?.length) {
    return toPeerRows(liveRows, symbol);
  }

  return [];
}

export async function getFundamentals(symbol: string) {
  const [overview, yearly, quarterly, segments, geography, peers, notes] = await Promise.all([
    selectSingle<LiveOverviewRow>("app_stock_overview", symbol),
    getFinancials(symbol, "yearly"),
    getFinancials(symbol, "quarterly"),
    getSegments(symbol),
    getGeography(symbol),
    getPeers(symbol),
    selectRows<LiveBusinessNoteRow>("app_business_notes", { symbol, orderBy: "created_at", ascending: false })
  ]);

  const businessNotes = toBusinessNotes(notes ?? []);
  const filingNotes = businessNotes.map((note) => note.note).slice(0, 4);
  const loadedParts = [yearly.length > 0, quarterly.length > 0, segments.length > 0, geography.length > 0, peers.length > 0, businessNotes.length > 0].filter(Boolean).length;

  if (loadedParts > 0) {
    const liveStatus = loadedParts >= 4 ? "live" : "partial";
    return {
      headline:
        overview?.fundamentals_headline ||
        filingNotes[0] ||
        (liveStatus === "live"
          ? "Structured fundamentals are live from Supabase, with financial lines, business notes, and peer context available."
          : "Fundamentals are partially loaded. Queue more filing documents to complete yearly, mix, and peer coverage."),
      liveStatus,
      asOfDate: overview?.snapshot_date ?? businessNotes[0]?.createdAt?.slice(0, 10),
      metricCards: buildMetricCardsFromLive(yearly, peers, symbol),
      yearly,
      quarterly,
      segmentMix: segments,
      geographyMix: geography,
      peerComparison: peers,
      businessNotes,
      filingNotes
    } satisfies FundamentalsSnapshot;
  }

  return buildMissingFundamentals(symbol, overview);
}

export async function getPrices(symbol: string) {
  const liveRows = await selectRows<LivePriceRow>("app_prices", {
    symbol,
    orderBy: "price_date",
    ascending: true
  });

  if (liveRows?.length) {
    return toPricePoints(liveRows);
  }

  return [];
}

export async function getTechnicalIndicators(symbol: string) {
  const [technicalRow, overview] = await Promise.all([
    selectSingle<LiveTechnicalSnapshotRow>("app_technical_snapshot", symbol),
    getOverview(symbol)
  ]);

  const liveIndicators = buildTechnicalIndicators(technicalRow, overview?.close ?? 0);
  if (liveIndicators?.length) {
    return liveIndicators;
  }

  return [];
}

export async function getSupportResistance(symbol: string) {
  const liveRows = await selectRows<LivePriceLevelRow>("app_price_levels", {
    symbol,
    orderBy: "value",
    ascending: true
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): PriceLevel => ({
        label: row.label,
        value: asNumber(row.value),
        reason: row.reason || "Structured price level"
      })
    );
  }

  return [];
}

export async function getCorporateActions(symbol: string) {
  const liveRows = await selectRows<LiveCorporateActionRow>("app_corporate_actions", {
    symbol,
    orderBy: "action_date",
    ascending: false,
    limit: 10
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): CorporateAction => ({
        id: row.id,
        actionType: row.action_type,
        actionDate: row.action_date,
        details: row.details ?? {}
      })
    );
  }

  return [];
}

export async function getTrendSummary(symbol: string) {
  const technicalRow = await selectSingle<LiveTechnicalSnapshotRow>("app_technical_snapshot", symbol);

  if (technicalRow) {
    return {
      liveStatus: asStringArray(technicalRow.technical_events).length > 0 ? "live" : "partial",
      asOfDate: technicalRow.price_date,
      trendState: technicalRow.trend_state || "Constructive",
      summary:
        technicalRow.technical_summary ||
        "The live technical snapshot is available, but the narrative summary is still sparse.",
      events: asStringArray(technicalRow.technical_events)
    };
  }

  const overview = await selectSingle<LiveOverviewRow>("app_stock_overview", symbol);
  return buildMissingTechnicals(symbol, overview);
}

export async function getNews(symbol: string) {
  const liveRows = await selectRows<LiveNewsRow>("app_company_news", {
    symbol,
    orderBy: "published_at",
    ascending: false
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): NewsArticle => ({
        id: row.id,
        headline: row.headline,
        source: row.source_name,
        sourceUrl: row.canonical_url ?? undefined,
        publishedAt: row.published_at,
        relevance: normalizeRelevance(row.relevance),
        impactScore: asNumber(row.impact_score),
        sentiment: normalizeSentiment(row.sentiment),
        whyItMatters: row.why_it_matters || "This article is linked to the stock, but the impact note is still sparse.",
        summary: row.summary ?? undefined,
        entities: toNewsEntities(row.entities)
      })
    );
  }

  return [];
}

export async function getEvents(symbol: string) {
  const liveRows = await selectRows<LiveEventRow>("app_company_events", {
    symbol,
    orderBy: "event_date",
    ascending: true
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): EventItem => ({
        id: row.id,
        title: row.event_title,
        eventDate: row.event_date,
        category: row.event_type,
        note: row.note || "Upcoming event linked to this company."
      })
    );
  }

  return [];
}

export async function getBehavior(symbol: string) {
  const liveRows = await selectRows<LiveBehaviorRow>("app_behavior_snapshot", {
    symbol,
    orderBy: "price_date",
    ascending: false,
    limit: 1
  });

  const snapshot = toBehaviorSnapshot(liveRows?.[0] ?? null);
  if (snapshot) {
    return snapshot;
  }

  return buildMissingBehavior(symbol);
}

export async function getPatterns(symbol: string) {
  const liveRows = await selectRows<LivePatternRow>("app_patterns", {
    symbol,
    orderBy: "confidence_pct",
    ascending: false
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): PatternMatch => ({
        id: row.id,
        patternName: row.pattern_name,
        confidencePct: asNumber(row.confidence_pct),
        note: row.note || "Live pattern match with limited narrative.",
        similarCases: asStringArray(row.similar_cases)
      })
    );
  }

  return lookupBundle(symbol)?.patterns ?? null;
}

export async function getPatternCases(symbol: string) {
  const patterns = await getPatterns(symbol);
  if (!patterns) {
    return null;
  }

  return patterns.flatMap((pattern) =>
    pattern.similarCases.map((label) => ({
      patternName: pattern.patternName,
      label
    }))
  );
}

export async function getStrategies(symbol: string) {
  const liveRows = await selectRows<LiveStrategyRow>("app_strategy_evaluations", {
    symbol,
    orderBy: "confidence_pct",
    ascending: false
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): StrategyEvaluation => ({
        id: row.id,
        strategyName: row.strategy_name,
        category: row.category ?? undefined,
        matched: row.matched,
        confidencePct: asNumber(row.confidence_pct),
        evaluationDate: row.evaluation_date,
        sourceSnapshotDate: row.source_snapshot_date ?? undefined,
        matchedRuleCount: row.matched_rule_count ?? undefined,
        totalRuleCount: row.total_rule_count ?? undefined,
        supportQuality: row.support_quality ?? undefined,
        provenanceNote: row.provenance_note ?? undefined,
        support: asStringArray(row.support_points),
        invalidation: row.invalidation || "No explicit invalidation recorded yet.",
        explanation: row.explanation || "Live strategy evaluation is available, but the explanation is still sparse."
      })
    );
  }

  return [];
}

export async function getScenarios(symbol: string) {
  const liveRows = await selectRows<LiveScenarioRow>("app_scenarios", {
    symbol,
    orderBy: "confidence_pct",
    ascending: false
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): Scenario => ({
        id: row.id,
        title: row.title,
        stance: row.stance,
        confidencePct: asNumber(row.confidence_pct),
        evaluationDate: row.evaluation_date,
        sourceSnapshotDate: row.source_snapshot_date ?? undefined,
        provenanceNote: row.provenance_note ?? undefined,
        trigger: row.trigger_condition || "Awaiting a cleaner trigger definition.",
        invalidation: row.invalidation || "Awaiting a cleaner invalidation definition.",
        payoffFrame: row.payoff_frame || "Scenario payoff framing not yet provided.",
        explanation: row.explanation || "Live scenario is available, but the explanation is still sparse."
      })
    );
  }

  return [];
}

export async function getStockBundle(symbol: string) {
  await ensureTickerHydrated(symbol);
  const overview = await getOverview(symbol);

  if (!overview) {
    return null;
  }

  const [fundamentals, prices, indicators, trend, supportResistance, news, events, behavior, strategies, scenarios, patterns] =
    await Promise.all([
      getFundamentals(symbol),
      getPrices(symbol),
      getTechnicalIndicators(symbol),
      getTrendSummary(symbol),
      getSupportResistance(symbol),
      getNews(symbol),
      getEvents(symbol),
      getBehavior(symbol),
      getStrategies(symbol),
      getScenarios(symbol),
      getPatterns(symbol)
    ]);

  const base = lookupBundle(symbol) ?? buildSkeletonBundle(overview);
  const technicalsLoadedParts = [
    prices.length > 0,
    indicators.length > 0,
    supportResistance.length > 0,
    trend?.events.length ? true : false,
    trend?.trendState !== "Awaiting analytics load"
  ].filter(Boolean).length;
  const technicalsLiveStatus: "live" | "partial" = technicalsLoadedParts >= 4 ? "live" : "partial";
  const technicals =
    technicalsLoadedParts > 0
      ? {
          liveStatus: technicalsLiveStatus,
          asOfDate: trend?.asOfDate ?? prices.at(-1)?.date,
          trendState: trend?.trendState ?? "Awaiting analytics load",
          summary: trend?.summary ?? buildMissingTechnicals(symbol).summary,
          indicators,
          prices,
          supportResistance,
          events: trend?.events ?? []
        }
      : buildMissingTechnicals(symbol, await selectSingle<LiveOverviewRow>("app_stock_overview", symbol));

  return {
    ...base,
    overview,
    fundamentals: fundamentals ?? base.fundamentals,
    technicals,
    news,
    events,
    behavior,
    strategies: strategies ?? base.strategies,
    scenarios: scenarios ?? base.scenarios,
    patterns: patterns ?? base.patterns
  };
}

export async function getScreeners() {
  const liveRows = await selectRows<LiveStrategyRow>("app_strategy_evaluations", {
    orderBy: "confidence_pct",
    ascending: false
  });

  if (liveRows?.length) {
    const companies = await getSearchResults();
    return liveRows
      .filter((row) => row.matched)
      .map((row) => {
        const company = companies.find((candidate) => candidate.symbol === row.symbol);
        return {
          symbol: row.symbol,
          companyName: company?.companyName || row.symbol,
          strategyName: row.strategy_name,
          confidencePct: asNumber(row.confidence_pct),
          explanation: row.explanation || "Live screener match is available, but the explanation is still sparse."
        };
      });
  }

  return [];
}

export async function getLearnGlossary() {
  return learnGlossary;
}

export async function getSourceStatuses() {
  const liveRows = await selectRows<LiveSourceStatusRow>("app_source_statuses", {
    orderBy: "adapter",
    ascending: true
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): SourceStatus => ({
        adapter: row.adapter,
        freshness: row.freshness,
        status: normalizeSourceStatus(row.status),
        note: row.note
      })
    );
  }

  return [];
}

export async function getIngestionJobs() {
  const liveRows = await selectRows<LiveIngestionJobRow>("app_ingestion_jobs", {
    orderBy: "started_at",
    ascending: false
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): IngestionJob => ({
        id: row.id,
        source: row.source,
        target: row.target_table,
        status: normalizeJobStatus(row.status),
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? undefined,
        note: row.note || "Ingestion job recorded without a detailed note."
      })
    );
  }

  return [];
}

export async function getSourceRuns() {
  const liveRows = await selectRows<LiveSourceRunRow>("app_source_runs", {
    orderBy: "started_at",
    ascending: false,
    limit: 10
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): SourceRun => ({
        id: row.id,
        adapter: row.adapter,
        sourceType: row.source_type,
        status: (row.status as SourceRun["status"]) || "warning",
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? undefined,
        detail: row.detail || "Source run recorded without a detail message."
      })
    );
  }

  return [];
}

export async function getDataQualityIssues() {
  const liveRows = await selectRows<LiveDataQualityIssueRow>("app_data_quality_issues", {
    orderBy: "created_at",
    ascending: false,
    limit: 10
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): DataQualityIssue => ({
        id: row.id,
        adapter: row.adapter,
        issueType: row.issue_type,
        detail: row.detail,
        resolved: row.resolved,
        createdAt: row.created_at
      })
    );
  }

  return [];
}

export async function getStaleSymbols() {
  const liveRows = await selectRows<LiveStaleSymbolRow>("app_stale_symbols", {
    orderBy: "snapshot_age_days",
    ascending: false,
    limit: 25
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): StaleSymbol => ({
        companyId: row.company_id,
        companyName: row.company_name,
        exchange: row.exchange,
        symbol: row.symbol,
        snapshotDate: row.snapshot_date ?? undefined,
        snapshotAgeDays: row.snapshot_age_days ?? undefined,
        status: row.status,
        note: row.note
      })
    );
  }

  return [];
}

export async function getFilingDocuments() {
  const liveRows = await selectRows<LiveFilingDocumentRow>("app_filing_documents", {
    orderBy: "queued_at",
    ascending: false,
    limit: 25
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): FilingDocument => ({
        id: row.id,
        source: row.source,
        symbol: row.symbol,
        exchange: row.exchange,
        sourceType: row.source_type,
        documentKind: row.document_kind,
        status: row.status,
        inputPath: row.input_path ?? undefined,
        ocrPath: row.ocr_path ?? undefined,
        outputPath: row.output_path ?? undefined,
        normalizedOutputPath: row.normalized_output_path ?? undefined,
        errorMessage: row.error_message ?? undefined,
        queuedAt: row.queued_at,
        processingStartedAt: row.processing_started_at ?? undefined,
        processingFinishedAt: row.processing_finished_at ?? undefined
      })
    );
  }

  return [];
}

export async function getAdminOverview() {
  const liveRows = await selectRows<LiveAdminOverviewRow>("app_admin_overview");
  const row = liveRows?.[0];

  if (row) {
    return {
      totalSources: asNumber(row.total_sources),
      healthySources: asNumber(row.healthy_sources),
      warningSources: asNumber(row.warning_sources),
      degradedSources: asNumber(row.degraded_sources),
      staleSources: asNumber(row.stale_sources),
      totalJobs: asNumber(row.total_jobs),
      runningJobs: asNumber(row.running_jobs),
      queuedJobs: asNumber(row.queued_jobs),
      warningJobs: asNumber(row.warning_jobs),
      successJobs: asNumber(row.success_jobs),
      openIssues: asNumber(row.open_issues),
      resolvedIssues: asNumber(row.resolved_issues),
      latestRunStartedAt: row.latest_run_started_at ?? undefined,
      latestActivityAt: row.latest_activity_at ?? undefined
    } satisfies AdminOverview;
  }

  const [sources, jobs] = await Promise.all([getSourceStatuses(), getIngestionJobs()]);
  return {
    totalSources: sources.length,
    healthySources: sources.filter((item) => item.status === "healthy").length,
    warningSources: sources.filter((item) => item.status === "warning").length,
    degradedSources: sources.filter((item) => item.status === "degraded").length,
    staleSources: sources.filter((item) => item.status === "stale").length,
    totalJobs: jobs.length,
    runningJobs: jobs.filter((item) => item.status === "running").length,
    queuedJobs: jobs.filter((item) => item.status === "queued").length,
    warningJobs: jobs.filter((item) => item.status === "warning").length,
    successJobs: jobs.filter((item) => item.status === "success").length,
    openIssues: 0,
    resolvedIssues: 0
  } satisfies AdminOverview;
}

export async function getFeaturedPatterns() {
  const liveRows = await selectRows<LivePatternRow>("app_patterns", {
    orderBy: "confidence_pct",
    ascending: false,
    limit: 2
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): PatternMatch => ({
        id: row.id,
        patternName: row.pattern_name,
        confidencePct: asNumber(row.confidence_pct),
        note: row.note || "Live pattern match with limited narrative.",
        similarCases: asStringArray(row.similar_cases)
      })
    );
  }

  return featuredPatterns;
}

export async function getUpcomingEvents() {
  const liveRows = await selectRows<LiveEventRow>("app_company_events", {
    orderBy: "event_date",
    ascending: true
  });

  if (liveRows?.length) {
    return liveRows.map(
      (row): EventItem => ({
        id: row.id,
        title: row.event_title,
        eventDate: row.event_date,
        category: row.event_type,
        note: row.note || "Upcoming event linked to this company."
      })
    );
  }

  return [];
}
