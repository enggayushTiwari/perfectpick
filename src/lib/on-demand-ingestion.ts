import "server-only";

import YahooFinance from "yahoo-finance2";
import type { SearchResult } from "@/lib/contracts";
import { createSupabaseAdminClient, createSupabaseReadClient } from "@/lib/supabase";

type PriceBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
};

type HydrationResult = {
  symbol: string;
  yahooSymbol?: string;
  ingested: boolean;
  reason?: string;
  snapshotDate?: string;
};

type NewsRefreshResult = {
  symbol: string;
  yahooSymbol?: string;
  ingested: boolean;
  reason?: string;
  articleCount?: number;
  eventCount?: number;
};

type StoredCoverageStatus = {
  snapshotDate: string;
  isFresh: boolean;
};

const yf = new YahooFinance();
const remoteSearchCache = new Map<string, { expiresAt: number; results: SearchResult[] }>();

async function getStoredCoverageStatus(symbol: string, maxAgeDays: number): Promise<StoredCoverageStatus | null> {
  const readClient = createSupabaseReadClient();
  if (!readClient) {
    return null;
  }

  const { data } = await readClient
    .from("app_stock_overview")
    .select("symbol, snapshot_date")
    .eq("symbol", symbol)
    .limit(1)
    .maybeSingle();

  if (!data?.snapshot_date) {
    return null;
  }

  const snapshotDate = new Date(`${data.snapshot_date}T00:00:00Z`);
  const ageMs = Date.now() - snapshotDate.getTime();
  const maxAgeMs = 1000 * 60 * 60 * 24 * maxAgeDays;

  return {
    snapshotDate: data.snapshot_date,
    isFresh: ageMs <= maxAgeMs
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetry<T>(task: () => Promise<T>, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Remote request failed.");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function toCrores(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }

  return round(value / 10_000_000, 2);
}

function normalizePercent(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.abs(value) <= 1.5 ? round(value * 100, 2) : round(value, 2);
}

function movingAverage(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  const slice = values.slice(-period);
  return round(slice.reduce((sum, value) => sum + value, 0) / period, 2);
}

function exponentialMovingAverage(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (const value of values.slice(period)) {
    ema = (value - ema) * multiplier + ema;
  }

  return round(ema, 2);
}

function relativeStrengthIndex(values: number[], period = 14) {
  if (values.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 2);
}

function returnsSeries(values: number[]) {
  const returns: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] === 0) {
      continue;
    }
    returns.push((values[index] - values[index - 1]) / values[index - 1]);
  }

  return returns;
}

function correlation(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 10) {
    return null;
  }

  const a = left.slice(-length);
  const b = right.slice(-length);
  const meanA = a.reduce((sum, value) => sum + value, 0) / length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / length;

  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let index = 0; index < length; index += 1) {
    const diffA = a[index] - meanA;
    const diffB = b[index] - meanB;
    numerator += diffA * diffB;
    varianceA += diffA ** 2;
    varianceB += diffB ** 2;
  }

  if (!varianceA || !varianceB) {
    return null;
  }

  return numerator / Math.sqrt(varianceA * varianceB);
}

function lookbackReturnPct(values: number[], lookbackDays = 20) {
  if (values.length <= lookbackDays) {
    return null;
  }

  const start = values.at(-(lookbackDays + 1));
  const finish = values.at(-1);
  if (!start || finish === undefined || start === 0) {
    return null;
  }

  return round(((finish - start) / start) * 100, 2);
}

function averageTrueRange(bars: PriceBar[], period = 14) {
  if (bars.length <= period) {
    return null;
  }

  const trueRanges: number[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index];
    const previous = bars[index - 1];
    const range = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    trueRanges.push(range);
  }

  if (trueRanges.length < period) {
    return null;
  }

  const recent = trueRanges.slice(-period);
  return round(recent.reduce((sum, value) => sum + value, 0) / period, 2);
}

function volumeWeightedAveragePrice(bars: PriceBar[], period = 20) {
  if (!bars.length) {
    return null;
  }

  const recent = bars.slice(-Math.min(period, bars.length));
  let numerator = 0;
  let denominator = 0;

  for (const bar of recent) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    numerator += typicalPrice * bar.volume;
    denominator += bar.volume;
  }

  if (!denominator) {
    return null;
  }

  return round(numerator / denominator, 2);
}

function inferSentiment(title: string) {
  const normalized = title.toLowerCase();
  const positiveWords = ["beat", "growth", "strong", "win", "expansion", "upgrade", "record", "surge", "rise"];
  const negativeWords = ["miss", "fall", "drop", "cut", "downgrade", "weak", "decline", "risk", "delay"];

  if (positiveWords.some((word) => normalized.includes(word))) {
    return { sentiment: "positive" as const, impactDirection: "positive", relevance: "high" as const, impactScore: 72 };
  }

  if (negativeWords.some((word) => normalized.includes(word))) {
    return { sentiment: "negative" as const, impactDirection: "negative", relevance: "high" as const, impactScore: 68 };
  }

  return { sentiment: "neutral" as const, impactDirection: "neutral", relevance: "medium" as const, impactScore: 54 };
}

function classifyEventType(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("earnings") || normalized.includes("result")) {
    return "Earnings";
  }
  if (normalized.includes("dividend")) {
    return "Dividend";
  }
  if (normalized.includes("filing") || normalized.includes("annual report")) {
    return "Filing";
  }
  if (normalized.includes("agm") || normalized.includes("meeting")) {
    return "Corporate";
  }
  return "Event";
}

function buildNewsEntities(input: { symbol: string; companyName: string; sector: string; industry: string; title: string }) {
  const entities = [
    { entityType: "ticker", entityName: input.symbol.toUpperCase(), relevanceScore: 0.99 },
    { entityType: "company", entityName: input.companyName, relevanceScore: 0.98 }
  ];

  if (input.sector && input.sector !== "Unknown") {
    entities.push({ entityType: "sector", entityName: input.sector, relevanceScore: 0.65 });
  }
  if (input.industry && input.industry !== "Unknown") {
    entities.push({ entityType: "industry", entityName: input.industry, relevanceScore: 0.61 });
  }

  const normalized = input.title.toLowerCase();
  const topicKeywords = [
    ["earnings", "earnings"],
    ["result", "earnings"],
    ["margin", "margins"],
    ["deal", "deals"],
    ["demand", "demand"],
    ["guidance", "guidance"],
    ["dividend", "dividend"],
    ["retail", "retail"],
    ["telecom", "telecom"],
    ["capex", "capex"]
  ] as const;

  for (const [keyword, topic] of topicKeywords) {
    if (normalized.includes(keyword)) {
      entities.push({ entityType: "topic", entityName: topic, relevanceScore: 0.56 });
    }
  }

  return entities.filter(
    (entity, index, collection) =>
      collection.findIndex(
        (candidate) => candidate.entityType === entity.entityType && candidate.entityName.toLowerCase() === entity.entityName.toLowerCase()
      ) === index
  );
}

function inferTrendState(close: number, sma20: number | null, sma50: number | null, sma200: number | null, rsi14: number | null) {
  if (sma20 && sma50 && sma200 && close > sma20 && sma20 > sma50 && sma50 > sma200 && (rsi14 ?? 0) >= 58) {
    return "Bullish with trend alignment";
  }

  if (sma20 && sma50 && close > sma20 && close > sma50) {
    return "Constructive";
  }

  if (sma20 && close < sma20 && sma50 && close < sma50) {
    return "Under pressure";
  }

  return "Mixed";
}

function buildTechnicalEvents(close: number, sma20: number | null, sma50: number | null, sma200: number | null, rsi14: number | null, volumeConfirmation: boolean) {
  const events: string[] = [];

  if (sma20 && sma50 && sma200 && close > sma20 && sma20 > sma50 && sma50 > sma200) {
    events.push("Major moving averages remain stacked in bullish order.");
  } else {
    events.push("Moving-average alignment is not fully stacked yet.");
  }

  if ((rsi14 ?? 0) >= 60) {
    events.push("Momentum is strong without obviously extreme exhaustion.");
  } else if ((rsi14 ?? 0) <= 40) {
    events.push("Momentum is soft and needs recovery before trend conviction improves.");
  } else {
    events.push("Momentum remains constructive but measured.");
  }

  events.push(volumeConfirmation ? "Recent participation is supportive of the current move." : "Volume confirmation is still modest.");
  return events;
}

function classifyMacroRegime(sector: string, benchmarkReturnPct: number | null) {
  const normalizedSector = sector.toLowerCase();

  if (benchmarkReturnPct !== null && benchmarkReturnPct >= 3) {
    if (["financial", "bank", "auto", "real estate", "capital goods"].some((token) => normalizedSector.includes(token))) {
      return "Risk-on domestic cycle";
    }

    return "Risk-on broad market";
  }

  if (benchmarkReturnPct !== null && benchmarkReturnPct <= -3) {
    return "Risk-off / defensive tape";
  }

  if (["information technology", "it", "pharma", "health"].some((token) => normalizedSector.includes(token))) {
    return "Global-demand sensitive";
  }

  return "Range-bound broad market";
}

function buildBehaviorSnapshot(input: {
  closeSeries: number[];
  latestClose: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  benchmarkCloseSeries: number[];
  sector: string;
  benchmarkSymbol?: string;
}) {
  const { closeSeries, latestClose, sma20, sma50, rsi14, benchmarkCloseSeries, sector } = input;
  const oneMonth = closeSeries.slice(-21);
  const dailyReturns = oneMonth.slice(1).map((value, index) => (value - oneMonth[index]) / oneMonth[index]);
  const avgAbsReturn =
    dailyReturns.length > 0
      ? dailyReturns.reduce((sum, value) => sum + Math.abs(value), 0) / dailyReturns.length
      : 0;
  const stockReturnSeries = returnsSeries(closeSeries);
  const benchmarkReturnSeries = returnsSeries(benchmarkCloseSeries);
  const stockLookbackReturnPct = lookbackReturnPct(closeSeries, 20);
  const benchmarkReturnPct = lookbackReturnPct(benchmarkCloseSeries, 20);
  const returnCorrelation = correlation(stockReturnSeries, benchmarkReturnSeries);
  const momentumSensitivity = Math.max(15, Math.min(90, round(((rsi14 ?? 50) - 30) * 1.6, 0)));
  const accelerationScore =
    sma20 && sma50 ? Math.max(10, Math.min(90, round(((sma20 - sma50) / latestClose) * 1200 + 50, 0))) : 50;
  const trendDecayScore = Math.max(10, Math.min(90, round(60 - momentumSensitivity / 2, 0)));
  const volatilitySensitivity = Math.max(10, Math.min(90, round(avgAbsReturn * 1400, 0)));
  const marketLinkageScore =
    returnCorrelation === null ? 48 : Math.max(10, Math.min(90, round(50 + returnCorrelation * 35, 0)));
  const relativeStrengthPct =
    stockLookbackReturnPct !== null && benchmarkReturnPct !== null ? round(stockLookbackReturnPct - benchmarkReturnPct, 2) : null;
  const benchmarkSymbol = input.benchmarkSymbol ?? "^NSEI";
  const macroRegime = classifyMacroRegime(sector, benchmarkReturnPct);
  const regimeLabel =
    momentumSensitivity >= 60 && accelerationScore >= 55 && trendDecayScore <= 40
      ? "Trend-following"
      : volatilitySensitivity >= 65
        ? "High-volatility"
        : marketLinkageScore >= 60
          ? "Market-linked"
          : "Balanced";
  const contextSignals = [
    benchmarkReturnPct === null
      ? "Benchmark context is unavailable, so broad-market linkage is estimated from local price behavior."
      : `${benchmarkSymbol} is ${benchmarkReturnPct >= 0 ? "up" : "down"} ${Math.abs(benchmarkReturnPct).toFixed(1)}% over the recent monthly window.`,
    relativeStrengthPct === null
      ? "Relative strength versus the benchmark is not available yet."
      : relativeStrengthPct >= 0
        ? `The stock is outperforming the benchmark by ${relativeStrengthPct.toFixed(1)} percentage points.`
        : `The stock is lagging the benchmark by ${Math.abs(relativeStrengthPct).toFixed(1)} percentage points.`,
    marketLinkageScore >= 60
      ? "Broad market direction is still explaining a meaningful part of the move."
      : "Company-specific price behavior is carrying more of the move than the benchmark alone.",
    volatilitySensitivity >= 60
      ? "Volatility remains elevated enough to warrant wider risk framing."
      : "Volatility sensitivity remains relatively contained."
  ];
  const marketContextSummary =
    benchmarkReturnPct === null
      ? `${macroRegime}. Market-context overlays are partially available because the benchmark comparison could not be refreshed.`
      : `${macroRegime}. ${benchmarkSymbol} has moved ${benchmarkReturnPct >= 0 ? "up" : "down"} ${Math.abs(
          benchmarkReturnPct
        ).toFixed(1)}% over the recent lookback, and this stock is ${
          relativeStrengthPct !== null && relativeStrengthPct >= 0 ? "outperforming" : "underperforming"
        } that benchmark${relativeStrengthPct === null ? "" : ` by ${Math.abs(relativeStrengthPct).toFixed(1)} percentage points`}.`;

  return {
    momentumSensitivity,
    accelerationScore,
    trendDecayScore,
    volatilitySensitivity,
    marketLinkageScore,
    regimeLabel,
    macroRegime,
    benchmarkSymbol,
    benchmarkReturnPct,
    relativeStrengthPct,
    marketContextSummary,
    contextSignals,
    narrative:
      momentumSensitivity >= 60
        ? "The stock is behaving like a live trend candidate, with momentum carrying most of the current attention."
        : "The stock is acting more measured than explosive, so trend quality matters more than pure speed."
  };
}

function buildStrategies(input: {
  symbol: string;
  close: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  volumeConfirmation: boolean;
  upcomingEvent: boolean;
  roePct: number | null;
}) {
  const trendMatch =
    input.sma20 !== null &&
    input.sma50 !== null &&
    input.sma200 !== null &&
    input.close > input.sma20 &&
    input.sma20 > input.sma50 &&
    input.sma50 > input.sma200 &&
    (input.rsi14 ?? 0) >= 55;
  const breakoutMatch = input.sma20 !== null && input.close > input.sma20 && input.volumeConfirmation && (input.rsi14 ?? 0) >= 60;
  const meanReversion = (input.rsi14 ?? 100) <= 35;
  const qualityMomentum = (input.roePct ?? 0) >= 18 && trendMatch;

  return [
    {
      slug: "trend-continuation",
      strategyName: "Trend Continuation",
      matched: trendMatch,
      confidencePct: trendMatch ? 78 : 34,
      matchedRuleCount: [trendMatch, (input.rsi14 ?? 0) >= 55, input.volumeConfirmation].filter(Boolean).length,
      totalRuleCount: 3,
      supportQuality: trendMatch ? "strong" : (input.rsi14 ?? 0) >= 50 ? "moderate" : "weak",
      supportPoints: [
        trendMatch ? "Price sits above aligned moving averages" : "Trend stack is incomplete",
        (input.rsi14 ?? 0) >= 55 ? "RSI remains in constructive territory" : "Momentum still needs improvement",
        input.volumeConfirmation ? "Volume confirmation present" : "Volume confirmation missing"
      ],
      invalidation: "Daily close below the short-term trend shelf.",
      provenanceNote: "Computed from persisted moving-average alignment, RSI, and volume participation checks.",
      explanation: trendMatch
        ? "Aligned moving averages plus healthy momentum fit a continuation setup."
        : "Trend is not aligned enough for a clean continuation setup.",
      category: "technical"
    },
    {
      slug: "breakout-confirmation",
      strategyName: "Breakout Confirmation",
      matched: breakoutMatch,
      confidencePct: breakoutMatch ? 72 : 40,
      matchedRuleCount: [input.sma20 !== null && input.close > input.sma20, input.volumeConfirmation, (input.rsi14 ?? 0) >= 60].filter(Boolean).length,
      totalRuleCount: 3,
      supportQuality: breakoutMatch ? "strong" : input.volumeConfirmation ? "moderate" : "weak",
      supportPoints: ["Recent price expansion", input.volumeConfirmation ? "Volume confirmation" : "Volume still needs confirmation"],
      invalidation: "Immediate rejection back into the prior base.",
      provenanceNote: "Derived from breakout participation, short-term trend position, and momentum confirmation.",
      explanation: breakoutMatch
        ? "This is a live breakout candidate because participation confirms the move."
        : "The setup is close, but still lacks one of the confirmation conditions.",
      category: "technical"
    },
    {
      slug: "mean-reversion-watchlist",
      strategyName: "Mean Reversion Watchlist",
      matched: meanReversion,
      confidencePct: meanReversion ? 67 : 20,
      matchedRuleCount: [meanReversion].filter(Boolean).length,
      totalRuleCount: 1,
      supportQuality: meanReversion ? "moderate" : "weak",
      supportPoints: [meanReversion ? "RSI reset condition met" : "No oversold reset visible"],
      invalidation: "Momentum expands back into trend continuation.",
      provenanceNote: "Driven by oversold reset logic from the latest RSI snapshot.",
      explanation: meanReversion
        ? "Oversold conditions make the stock a watchlist candidate for mean reversion."
        : "The stock is not sufficiently washed out for a mean-reversion setup.",
      category: "technical"
    },
    {
      slug: "quality-plus-momentum",
      strategyName: "Quality + Momentum",
      matched: qualityMomentum,
      confidencePct: qualityMomentum ? 80 : 38,
      matchedRuleCount: [(input.roePct ?? 0) >= 18, trendMatch].filter(Boolean).length,
      totalRuleCount: 2,
      supportQuality: qualityMomentum ? "strong" : trendMatch || (input.roePct ?? 0) >= 18 ? "moderate" : "weak",
      supportPoints: [
        input.roePct !== null ? `ROE ${input.roePct.toFixed(1)}%` : "ROE unavailable",
        trendMatch ? "Trend continuation structure" : "Trend support incomplete"
      ],
      invalidation: "Quality profile weakens or trend support breaks.",
      provenanceNote: "Combines return-on-equity quality checks with trend continuation structure.",
      explanation: qualityMomentum
        ? "Strong capital efficiency plus trend support creates a quality-momentum profile."
        : "The setup lacks either the return profile or the trend support for this bucket.",
      category: "hybrid"
    },
    {
      slug: "event-risk-watch",
      strategyName: "Event Risk Watch",
      matched: input.upcomingEvent,
      confidencePct: input.upcomingEvent ? 60 : 22,
      matchedRuleCount: [input.upcomingEvent].filter(Boolean).length,
      totalRuleCount: 1,
      supportQuality: input.upcomingEvent ? "moderate" : "weak",
      supportPoints: [input.upcomingEvent ? "Upcoming scheduled event" : "No near event trigger flagged"],
      invalidation: "Catalyst passes without material information change.",
      provenanceNote: "Triggered from the upcoming event calendar window in the latest refresh.",
      explanation: input.upcomingEvent
        ? "Upcoming events justify a wider scenario frame."
        : "No catalyst is close enough to elevate event risk.",
      category: "news"
    }
  ];
}

function buildScenarios(input: {
  snapshotDate: string;
  trendState: string;
  support: number | null;
  majorSupport: number | null;
  resistance: number | null;
}) {
  const support = input.support ?? 0;
  const majorSupport = input.majorSupport ?? support;
  const resistance = input.resistance ?? support;

  return [
    {
      evaluationDate: input.snapshotDate,
      sourceSnapshotDate: input.snapshotDate,
      stance: "Bullish",
      title: "Trend continuation above the current shelf",
      confidencePct: input.trendState.includes("Bullish") ? 70 : 58,
      triggerCondition: `Sustained closes above ${resistance.toFixed(2)} with momentum remaining constructive.`,
      invalidation: `Loss of ${support.toFixed(2)} on a closing basis.`,
      payoffFrame: "Favors continuation if participation holds up.",
      provenanceNote: "Bullish path is derived from the current trend state and nearest support/resistance structure.",
      explanation: "The bullish path depends on the stock holding the current support shelf and extending through the nearest resistance zone."
    },
    {
      evaluationDate: input.snapshotDate,
      sourceSnapshotDate: input.snapshotDate,
      stance: "Neutral",
      title: "Range digestion before the next directional move",
      confidencePct: 55,
      triggerCondition: `Price oscillates between ${support.toFixed(2)} and ${resistance.toFixed(2)} while momentum cools.`,
      invalidation: "A decisive breakout or breakdown invalidates the range case.",
      payoffFrame: "Favors patience over urgency.",
      provenanceNote: "Neutral path comes from consolidation logic around the current support shelf and resistance cap.",
      explanation: "A neutral consolidation is plausible after a fresh move because the market often pauses before committing to the next leg."
    },
    {
      evaluationDate: input.snapshotDate,
      sourceSnapshotDate: input.snapshotDate,
      stance: "Bearish",
      title: "Break below support into a deeper reset",
      confidencePct: 34,
      triggerCondition: `Price loses ${support.toFixed(2)} and fails to reclaim it quickly.`,
      invalidation: `Immediate recovery above ${resistance.toFixed(2)}.`,
      payoffFrame: `Would open space toward deeper support near ${majorSupport.toFixed(2)}.`,
      provenanceNote: "Bearish path is anchored to a failed-hold scenario at the current support shelf.",
      explanation: "The bearish case remains secondary, but a failed hold of current support would weaken the short-term structure."
    }
  ];
}

async function resolveYahooSymbol(symbol: string) {
  const upper = symbol.trim().toUpperCase();
  const candidates = upper.includes(".") ? [upper] : [`${upper}.NS`, `${upper}.BO`, upper];
  const modules = ["price", "summaryDetail", "summaryProfile", "assetProfile", "financialData", "defaultKeyStatistics", "calendarEvents", "earnings"] as const;

  for (const candidate of candidates) {
    try {
      const summary = await withRetry(() => yf.quoteSummary(candidate, { modules: [...modules] }));
      if (summary?.price?.regularMarketPrice || summary?.summaryDetail?.marketCap || summary?.assetProfile?.longBusinessSummary) {
        return { yahooSymbol: candidate, summary };
      }
    } catch {
      // Try next candidate.
    }
  }

  try {
    const search = await withRetry(() =>
      yf.search(upper, { region: "IN", lang: "en-IN", quotesCount: 8, newsCount: 0 })
    );
    const exact = search.quotes.find((quote: any) => {
      const candidate = typeof quote.symbol === "string" ? quote.symbol.toUpperCase() : "";
      return candidate === `${upper}.NS` || candidate === `${upper}.BO` || candidate === upper;
    });

    if (exact?.symbol) {
      const exactSymbol = String(exact.symbol);
      const summary = await withRetry(() => yf.quoteSummary(exactSymbol, { modules: [...modules] }));
      return { yahooSymbol: exactSymbol, summary };
    }
  } catch {
    // Fall through.
  }

  return null;
}

async function fetchNews(query: string, symbol: string, companyName: string, sector: string, industry: string) {
  try {
    const search = await withRetry(() =>
      yf.search(query, { region: "IN", lang: "en-IN", quotesCount: 1, newsCount: 5 })
    );
    return search.news
      .filter((item: any) => !item.relatedTickers || item.relatedTickers.includes(symbol) || item.relatedTickers.includes(`${symbol}.NS`))
      .slice(0, 4)
      .map((item: any) => {
        const sentiment = inferSentiment(String(item.title || ""));
        return {
          headline: String(item.title || `${symbol} related update`),
          sourceName: String(item.publisher || "Yahoo Finance"),
          publishedAt: item.providerPublishTime instanceof Date ? item.providerPublishTime.toISOString() : new Date().toISOString(),
          canonicalUrl: String(item.link || ""),
          summary: String(item.title || ""),
          articleBody: "",
          impactDirection: sentiment.impactDirection,
          impactScore: sentiment.impactScore,
          relevance: sentiment.relevance,
          sentiment: sentiment.sentiment,
          whyItMatters: `This headline is linked to ${symbol} in Yahoo Finance search results and may influence short-term attention around the stock.`,
          entities: buildNewsEntities({
            symbol,
            companyName,
            sector,
            industry,
            title: String(item.title || `${symbol} related update`)
          })
        };
      });
  } catch {
    return [];
  }
}

async function loadYahooSummaryForSymbol(symbol: string) {
  const resolved = await resolveYahooSymbol(symbol);
  if (!resolved) {
    return null;
  }

  const { yahooSymbol, summary } = resolved;
  const price: any = summary.price ?? {};
  const profile: any = summary.summaryProfile ?? summary.assetProfile ?? {};
  const companyName = String(price.longName || price.shortName || symbol);
  const sector = String(profile.sectorDisp || profile.sector || "Unknown");
  const industry = String(profile.industryDisp || profile.industry || "Unknown");

  return {
    yahooSymbol,
    summary,
    companyName,
    sector,
    industry
  };
}

export async function refreshTickerNewsEvents(symbol: string): Promise<NewsRefreshResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const adminClient = createSupabaseAdminClient();

  if (!normalizedSymbol || !adminClient) {
    return { symbol: normalizedSymbol, ingested: false, reason: "Supabase admin client is unavailable." };
  }

  const loaded = await loadYahooSummaryForSymbol(normalizedSymbol);
  if (!loaded) {
    return { symbol: normalizedSymbol, ingested: false, reason: "Could not resolve the ticker through Yahoo Finance." };
  }

  const { yahooSymbol, summary, companyName, sector, industry } = loaded;
  const news = await fetchNews(companyName, normalizedSymbol, companyName, sector, industry);
  const events = [];
  const earningsDates = summary.calendarEvents?.earnings?.earningsDate ?? [];
  const nextEarningsDate = Array.isArray(earningsDates) ? earningsDates.find((date) => date instanceof Date) : undefined;

  if (nextEarningsDate instanceof Date) {
    events.push({
      title: "Upcoming earnings date",
      eventType: "Earnings",
      eventDate: nextEarningsDate.toISOString().slice(0, 10),
      note: "Watch guidance, demand commentary, and management tone around the next result window."
    });
  }
  if (summary.calendarEvents?.exDividendDate instanceof Date) {
    events.push({
      title: "Ex-dividend date",
      eventType: "Dividend",
      eventDate: summary.calendarEvents.exDividendDate.toISOString().slice(0, 10),
      note: "Dividend calendar event surfaced through the market data provider."
    });
  }

  for (const article of news) {
    const eventType = classifyEventType(article.headline);
    if (eventType !== "Event") {
      events.push({
        title: article.headline,
        eventType,
        eventDate: article.publishedAt.slice(0, 10),
        note: article.whyItMatters
      });
    }
  }

  const dedupedEvents = events.filter(
    (event, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.title.toLowerCase() === event.title.toLowerCase() &&
          candidate.eventDate === event.eventDate &&
          candidate.eventType === event.eventType
      ) === index
  );

  const payload = {
    company: {
      symbol: normalizedSymbol,
      exchange: yahooSymbol.endsWith(".BO") ? "BSE" : "NSE",
      yahooSymbol,
      displayName: companyName,
      legalName: companyName,
      slug: slugify(companyName),
      sector,
      sectorSlug: sector !== "Unknown" ? slugify(sector) : null,
      industry,
      industrySlug: industry !== "Unknown" ? slugify(industry) : null,
      businessSummary: String((summary.summaryProfile ?? summary.assetProfile ?? {}).longBusinessSummary || "").trim() || null
    },
    news,
    events: dedupedEvents,
    admin: {
      adapterKey: "yahoo_finance_news",
      adapterLabel: "Yahoo Finance News",
      sourceType: "public-unofficial",
      freshnessExpectation: "On-demand news/event refresh",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sourceRunStatus: "healthy",
      sourceRunDetail: `News and event refresh completed for ${normalizedSymbol} using ${yahooSymbol}.`,
      jobStatus: "success",
      jobNote: `Loaded ${news.length} news items and ${dedupedEvents.length} events for ${normalizedSymbol}.`
    }
  };

  const { error } = await adminClient.rpc("app_ingest_symbol_payload", { payload });
  if (error) {
    return { symbol: normalizedSymbol, yahooSymbol, ingested: false, reason: error.message };
  }

  return {
    symbol: normalizedSymbol,
    yahooSymbol,
    ingested: true,
    articleCount: news.length,
    eventCount: dedupedEvents.length,
    reason: "News and events refreshed into Supabase."
  };
}

export async function searchRemoteTickers(query: string): Promise<SearchResult[]> {
  const normalized = query.trim().toUpperCase();
  if (!normalized) {
    return [];
  }

  const cached = remoteSearchCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  try {
    const search = await withRetry(() =>
      yf.search(normalized, { region: "IN", lang: "en-IN", quotesCount: 8, newsCount: 0 })
    );

    const results = search.quotes
      .map((quote: any) => {
        const rawSymbol = typeof quote.symbol === "string" ? quote.symbol.toUpperCase() : "";
        const symbol = rawSymbol.replace(/\.NS$|\.BO$/i, "");
        const exchange = rawSymbol.endsWith(".BO") ? "BSE" : "NSE";
        const sector = typeof quote.sector === "string" && quote.sector.trim() ? quote.sector : "Discovered symbol";
        const companyName =
          typeof quote.shortname === "string" && quote.shortname.trim()
            ? quote.shortname
            : typeof quote.longname === "string" && quote.longname.trim()
              ? quote.longname
              : symbol;

        if (!symbol || !companyName) {
          return null;
        }

        return {
          symbol,
          companyName,
          sector,
          exchange,
          tags: ["Remote discovery", exchange]
        } satisfies SearchResult;
      })
      .filter((item): item is SearchResult => Boolean(item))
      .filter((item, index, collection) => collection.findIndex((candidate) => candidate.symbol === item.symbol) === index)
      .slice(0, 8);

    remoteSearchCache.set(normalized, {
      expiresAt: Date.now() + 1000 * 60 * 5,
      results
    });

    return results;
  } catch {
    return [];
  }
}

export async function ensureTickerHydrated(
  symbol: string,
  options?: { force?: boolean; maxAgeDays?: number }
): Promise<HydrationResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const adminClient = createSupabaseAdminClient();
  const maxAgeDays = options?.maxAgeDays ?? 5;

  if (!normalizedSymbol || !adminClient) {
    return { symbol: normalizedSymbol, ingested: false, reason: "Supabase admin client is unavailable." };
  }

  if (!options?.force) {
    const storedCoverage = await getStoredCoverageStatus(normalizedSymbol, maxAgeDays);
    if (storedCoverage?.isFresh) {
      return {
        symbol: normalizedSymbol,
        ingested: true,
        reason: "Fresh stored snapshot already available.",
        snapshotDate: storedCoverage.snapshotDate
      };
    }
  }

  const resolved = await resolveYahooSymbol(normalizedSymbol);
  if (!resolved) {
    return { symbol: normalizedSymbol, ingested: false, reason: "Could not resolve the ticker through Yahoo Finance." };
  }

  const { yahooSymbol, summary } = resolved;
  const chart = await withRetry(() =>
    yf.chart(yahooSymbol, {
      period1: new Date(Date.now() - 370 * 24 * 60 * 60 * 1000),
      interval: "1d"
    })
  );
  const benchmarkChart = await withRetry(() =>
    yf.chart("^NSEI", {
      period1: new Date(Date.now() - 370 * 24 * 60 * 60 * 1000),
      interval: "1d"
    })
  ).catch(() => null);

  const rawBars = chart.quotes
    .filter((quote) => quote.date && quote.close !== null && quote.open !== null && quote.high !== null && quote.low !== null)
    .map(
      (quote): PriceBar => ({
        date: quote.date.toISOString().slice(0, 10),
        open: round(Number(quote.open)),
        high: round(Number(quote.high)),
        low: round(Number(quote.low)),
        close: round(Number(quote.close)),
        volume: Number(quote.volume ?? 0),
        source: "yahoo-finance-on-demand"
      })
    );

  if (!rawBars.length) {
    return { symbol: normalizedSymbol, yahooSymbol, ingested: false, reason: "Historical price data came back empty." };
  }

  const benchmarkBars =
    benchmarkChart?.quotes
      ?.filter((quote) => quote.date && quote.close !== null)
      .map((quote) => round(Number(quote.close))) ?? [];

  const latestBar = rawBars.at(-1)!;
  const closes = rawBars.map((bar) => bar.close);
  const volumes = rawBars.map((bar) => bar.volume);
  const sma20 = movingAverage(closes, 20);
  const sma50 = movingAverage(closes, 50);
  const sma200 = movingAverage(closes, 200);
  const rsi14 = relativeStrengthIndex(closes, 14);
  const ema12 = exponentialMovingAverage(closes, 12);
  const ema26 = exponentialMovingAverage(closes, 26);
  const macd = ema12 !== null && ema26 !== null ? round(ema12 - ema26, 2) : null;
  const atr14 = averageTrueRange(rawBars, 14);
  const vwap = volumeWeightedAveragePrice(rawBars, 20);
  const volumeConfirmation =
    volumes.length >= 20 &&
    latestBar.volume > volumes.slice(-20).reduce((sum, value) => sum + value, 0) / Math.min(20, volumes.length);
  const trendState = inferTrendState(latestBar.close, sma20, sma50, sma200, rsi14);
  const technicalEvents = buildTechnicalEvents(latestBar.close, sma20, sma50, sma200, rsi14, volumeConfirmation);
  const oneYearReturnPct =
    rawBars.length > 1 ? round(((latestBar.close - rawBars[0].close) / rawBars[0].close) * 100, 2) : 0;
  const primarySupport = round(Math.min(...rawBars.slice(-10).map((bar) => bar.low)), 2);
  const majorSupport = sma50 ?? round(Math.min(...rawBars.slice(-30).map((bar) => bar.low)), 2);
  const resistance = round(Math.max(...rawBars.slice(-20).map((bar) => bar.high)), 2);

  const price: any = summary.price ?? {};
  const detail: any = summary.summaryDetail ?? {};
  const profile: any = summary.summaryProfile ?? summary.assetProfile ?? {};
  const financialData: any = summary.financialData ?? {};
  const defaultStats: any = summary.defaultKeyStatistics ?? {};
  const earnings: any = summary.earnings ?? {};
  const earningsDates = summary.calendarEvents?.earnings?.earningsDate ?? [];
  const nextEarningsDate = Array.isArray(earningsDates) ? earningsDates.find((date) => date instanceof Date) : undefined;
  const hasUpcomingEvent =
    nextEarningsDate instanceof Date &&
    nextEarningsDate.getTime() - Date.now() <= 1000 * 60 * 60 * 24 * 45 &&
    nextEarningsDate.getTime() >= Date.now() - 1000 * 60 * 60 * 24 * 2;
  const roePct = normalizePercent(financialData.returnOnEquity);
  const ebitdaMarginPct = normalizePercent(financialData.ebitdaMargins);
  const patMarginPct = normalizePercent(financialData.profitMargins);
  const revenueGrowthPct = normalizePercent(financialData.revenueGrowth);
  const peRatio = detail.trailingPE ?? defaultStats.forwardPE ?? null;
  const pbRatio = defaultStats.priceToBook ?? null;
  const totalDebt = financialData.totalDebt ?? null;
  const totalCash = financialData.totalCash ?? null;
  const ebitda = financialData.ebitda ?? null;
  const netDebtToEbitda =
    totalDebt !== null && totalCash !== null && ebitda
      ? round((totalDebt - totalCash) / ebitda, 2)
      : null;
  const marketCapCr = toCrores(price.marketCap ?? detail.marketCap);
  const dayChangePct = normalizePercent(price.regularMarketChangePercent) ?? 0;
  const companyName = String(price.longName || price.shortName || profile.longBusinessSummary?.slice(0, 40) || normalizedSymbol);
  const businessSummary =
    String(profile.longBusinessSummary || "").trim() ||
    `${companyName} is tracked through Yahoo Finance and hydrated into Supabase on demand.`;
  const sector = String(profile.sectorDisp || profile.sector || "Unknown");
  const industry = String(profile.industryDisp || profile.industry || "Unknown");
  const behavior = buildBehaviorSnapshot({
    closeSeries: closes,
    latestClose: latestBar.close,
    sma20,
    sma50,
    rsi14,
    benchmarkCloseSeries: benchmarkBars,
    sector,
    benchmarkSymbol: "^NSEI"
  });
  const strategies = buildStrategies({
    symbol: normalizedSymbol,
    close: latestBar.close,
    sma20,
    sma50,
    sma200,
    rsi14,
    volumeConfirmation,
    upcomingEvent: Boolean(hasUpcomingEvent),
    roePct
  });
  const scenarios = buildScenarios({
    snapshotDate: latestBar.date,
    trendState,
    support: primarySupport,
    majorSupport,
    resistance
  });
  const yearlyFinancials =
    (earnings.financialsChart?.yearly ?? []).slice(-4).map((row: any) => {
      const revenueCr = toCrores(row.revenue) ?? 0;
      const patCr = toCrores(row.earnings) ?? 0;
      return {
        period: `FY${String(row.date).slice(-2)}`,
        revenueCr,
        ebitdaMarginPct,
        patCr,
        patMarginPct: revenueCr ? round((patCr / revenueCr) * 100, 2) : patMarginPct,
        roePct,
        rocePct: roePct,
        netDebtToEbitda
      };
    }) ?? [];
  const quarterlyFinancials =
    (earnings.financialsChart?.quarterly ?? []).slice(-4).map((row: any) => {
      const revenueCr = toCrores(row.revenue) ?? 0;
      const patCr = toCrores(row.earnings) ?? 0;
      return {
        period: String(row.date),
        revenueCr,
        ebitdaMarginPct,
        patCr,
        patMarginPct: revenueCr ? round((patCr / revenueCr) * 100, 2) : patMarginPct,
        roePct,
        rocePct: roePct,
        netDebtToEbitda
      };
    }) ?? [];

  const news = await fetchNews(companyName, normalizedSymbol, companyName, sector, industry);
  const businessNotes = [
    {
      sourceKind: "company-profile",
      sourceUrl: `https://finance.yahoo.com/quote/${yahooSymbol}`,
      note: `${companyName} is classified under ${industry} within the ${sector} sector in the current market profile.`,
      sourceExcerpt: businessSummary.slice(0, 240)
    }
  ];

  if (revenueGrowthPct !== null) {
    businessNotes.push({
      sourceKind: "financial-data",
      sourceUrl: `https://finance.yahoo.com/quote/${yahooSymbol}/financials`,
      note: `Current revenue-growth framing is ${revenueGrowthPct.toFixed(1)}%, which helps anchor the fundamentals narrative for this symbol.`,
      sourceExcerpt: "Derived from the latest revenue growth field returned by Yahoo Finance."
    });
  }

  const events = [];
  if (nextEarningsDate instanceof Date) {
    events.push({
      title: "Upcoming earnings date",
      eventType: "Earnings",
      eventDate: nextEarningsDate.toISOString().slice(0, 10),
      note: "Watch guidance, demand commentary, and management tone around the next result window."
    });
  }
  if (summary.calendarEvents?.exDividendDate instanceof Date) {
    events.push({
      title: "Ex-dividend date",
      eventType: "Dividend",
      eventDate: summary.calendarEvents.exDividendDate.toISOString().slice(0, 10),
      note: "Dividend calendar event surfaced through the market data provider."
    });
  }

  const payload = {
    company: {
      symbol: normalizedSymbol,
      exchange: yahooSymbol.endsWith(".BO") ? "BSE" : "NSE",
      yahooSymbol,
      displayName: companyName,
      legalName: companyName,
      slug: slugify(companyName),
      websiteUrl: profile.website || null,
      irUrl: profile.website || null,
      sector,
      sectorSlug: sector !== "Unknown" ? slugify(sector) : null,
      industry,
      industrySlug: industry !== "Unknown" ? slugify(industry) : null,
      businessSummary
    },
    snapshot: {
      date: latestBar.date,
      close: latestBar.close,
      dayChangePct,
      marketCapCr,
      oneYearReturnPct,
      summaryTags: [sector, industry, "Yahoo Finance on-demand"].filter(Boolean),
      fundamentalsHeadline:
        revenueGrowthPct !== null
          ? `${companyName} currently shows revenue growth of ${revenueGrowthPct.toFixed(1)}%, with live ratios and price data refreshed on demand.`
          : `${companyName} now has a live market snapshot, profile context, and technical state loaded on demand.`,
      technicalSummary: `${trendState}. Price, moving averages, and momentum have been refreshed from the latest available Yahoo Finance history.`,
      technicalEvents,
      behaviorNarrative: behavior.narrative
    },
    yearlyFinancials,
    quarterlyFinancials,
    ratios: {
      asOfDate: latestBar.date,
      roePct,
      rocePct: roePct,
      ebitdaMarginPct,
      patMarginPct,
      netDebtToEbitda,
      peRatio,
      pbRatio,
      revenueGrowthPct
    },
    segmentMix: [],
    geographyMix: [],
    businessNotes,
    prices: rawBars,
    technical: {
      priceDate: latestBar.date,
      sma20,
      sma50,
      sma200,
      rsi14,
      macd,
      atr14,
      vwap,
      trendState,
      trendExplanation: `${trendState}. Latest close is ${latestBar.close.toFixed(2)} with ${technicalEvents[0]?.toLowerCase() ?? "a mixed technical backdrop."}`,
      priceLevels: [
        { label: "Primary Support", value: primarySupport, reason: "Recent swing-low and short-term support band." },
        { label: "Major Support", value: majorSupport, reason: "Deeper structure support from the medium-term trend." },
        { label: "Immediate Resistance", value: resistance, reason: "Recent local high and breakout test zone." }
      ]
    },
    news,
    events,
    behavior: {
      priceDate: latestBar.date,
      ...behavior
    },
    strategies,
    scenarios,
    patterns: [
      {
        priceDate: latestBar.date,
        patternName:
          trendState.includes("Bullish") ? "Trend staircase" : trendState === "Constructive" ? "Constructive base" : "Range repair",
        confidencePct: trendState.includes("Bullish") ? 72 : 58,
        note: "Pattern classification is derived from current moving-average structure and recent price behavior.",
        similarCases: [
          latestBar.close > (sma20 ?? latestBar.close) ? "Price holding above short-term average" : "Price testing short-term average",
          volumeConfirmation ? "Participation expanding on the latest move" : "Participation remains measured"
        ]
      }
    ],
    admin: {
      adapterKey: "yahoo_finance",
      adapterLabel: "Yahoo Finance",
      sourceType: "public-unofficial",
      freshnessExpectation: "On-demand / EOD refresh",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sourceRunStatus: "healthy",
      sourceRunDetail: `On-demand refresh completed for ${normalizedSymbol} using ${yahooSymbol}.`,
      jobStatus: "success",
      jobNote: `Loaded live price, profile, ratio, technical, event, and strategy data for ${normalizedSymbol}.`
    }
  };

  const { data, error } = await adminClient.rpc("app_ingest_symbol_payload", { payload });

  if (error) {
    return { symbol: normalizedSymbol, yahooSymbol, ingested: false, reason: error.message };
  }

  return {
    symbol: normalizedSymbol,
    yahooSymbol,
    ingested: true,
    snapshotDate: latestBar.date,
    reason: typeof data === "object" ? "Live data fetched and written to Supabase." : "Live data fetched."
  };
}
