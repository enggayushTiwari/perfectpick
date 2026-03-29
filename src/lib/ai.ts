import "server-only";

import type { AiExplanation, StockBundle } from "@/lib/contracts";
import { createSupabaseReadClient } from "@/lib/supabase";

type AiSection = AiExplanation["section"];

type ExplanationContext = {
  symbol: string;
  companyName: string;
  section: AiSection;
  asOf: string;
  promptLabel: string;
  facts: string[];
  payload: Record<string, unknown>;
};

type RawAiResponse = {
  summary?: unknown;
  bullets?: unknown;
  caveats?: unknown;
};

type LiveOverviewRow = {
  symbol: string;
  company_name: string;
  exchange: "NSE" | "BSE";
  sector: string;
  industry: string;
  snapshot_date: string | null;
  close: number | null;
  day_change_pct: number | null;
  market_cap_cr: number | null;
  fundamentals_headline: string | null;
  technical_summary: string | null;
  technical_events: unknown;
  behavior_narrative: string | null;
};

type LiveFinancialRow = {
  period: string;
  revenue_cr: number | null;
  ebitda_margin_pct: number | null;
  pat_margin_pct: number | null;
  roe_pct: number | null;
  roce_pct: number | null;
  net_debt_to_ebitda: number | null;
};

type LiveMixRow = {
  label: string;
  value_pct: number;
};

type LivePeerRow = {
  symbol: string;
  company_name: string;
  market_cap_cr: number | null;
  pe_ratio: number | null;
  roe_pct: number | null;
  revenue_growth_pct: number | null;
  one_year_return_pct: number | null;
};

type LiveNoteRow = {
  note: string;
};

type LiveTechnicalRow = {
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
  label: string;
  value: number;
  reason: string | null;
};

type LiveStrategyRow = {
  strategy_name: string;
  matched: boolean;
  confidence_pct: number;
  support_points: unknown;
  invalidation: string | null;
  explanation: string | null;
};

type LiveScenarioRow = {
  stance: "Bullish" | "Neutral" | "Bearish";
  title: string;
  confidence_pct: number;
  trigger_condition: string | null;
  invalidation: string | null;
  payoff_frame: string | null;
  explanation: string | null;
};

const MODEL = process.env.GOOGLE_GENAI_MODEL || process.env.GEMINI_MODEL || "gemini-2.0-flash";
const API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const explanationCache = new Map<string, { expiresAt: number; value: AiExplanation }>();

function hasAiKey() {
  return API_KEY.trim().length > 0;
}

function compactText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
}

function cleanList(value: unknown, limit = 4) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

async function selectSingle<T>(view: string, symbol: string) {
  const client = createSupabaseReadClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.from(view).select("*").eq("symbol", symbol.toUpperCase()).limit(1).maybeSingle();
  if (error || !data) {
    return null;
  }

  return data as T;
}

async function selectRows<T>(
  view: string,
  symbol: string,
  options?: {
    limit?: number;
    orderBy?: string;
    ascending?: boolean;
    applySymbolFilter?: boolean;
    filters?: Array<{ column: string; value: string | number | boolean }>;
  }
) {
  const client = createSupabaseReadClient();
  if (!client) {
    return [];
  }

  let query = client.from(view).select("*");
  if (options?.applySymbolFilter !== false) {
    query = query.eq("symbol", symbol.toUpperCase());
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
    return [];
  }

  return data as T[];
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const direct = trimmed.match(/\{[\s\S]*\}/);
  if (!direct) {
    throw new Error("Model did not return a JSON object.");
  }

  return JSON.parse(direct[0]) as RawAiResponse;
}

function normalizeExplanation(section: AiSection, asOf: string, facts: string[], raw: RawAiResponse): AiExplanation {
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? compactText(raw.summary.trim(), 320)
      : "Structured platform data is available, but the explanation came back incomplete.";
  const bullets = cleanList(raw.bullets, 4);
  const caveats = cleanList(raw.caveats, 3);

  return {
    section,
    available: true,
    asOf,
    summary,
    bullets: bullets.length ? bullets : ["Explanation was generated, but no additional takeaways were returned."],
    caveats: caveats.length ? caveats : ["Educational summary only. Verify the underlying structured data before acting."],
    groundedFacts: facts.slice(0, 6),
    generatedAt: new Date().toISOString(),
    model: MODEL
  };
}

async function callGemini(context: ExplanationContext): Promise<AiExplanation> {
  const cacheKey = `${context.section}:${context.symbol}:${context.asOf}`;
  const cached = explanationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const prompt = [
    "You are writing an educational explanation for a stock research platform.",
    "Use only the structured facts provided below. Do not invent prices, metrics, events, or conclusions.",
    "Do not provide buy, sell, target price, or execution advice.",
    "If the facts are mixed, say so plainly.",
    "Return strict JSON with keys: summary, bullets, caveats.",
    "summary must be one concise paragraph.",
    "bullets must be an array of 2 to 4 short strings.",
    "caveats must be an array of 1 to 3 short strings.",
    `Section: ${context.promptLabel}`,
    `Company: ${context.companyName} (${context.symbol})`,
    `As of: ${context.asOf}`,
    `Grounded facts: ${JSON.stringify(context.facts)}`,
    `Structured payload: ${JSON.stringify(context.payload)}`
  ].join("\n");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "Respond only with valid JSON. Never mention data you were not given."
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 500,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini response was empty.");
  }

  const normalized = normalizeExplanation(context.section, context.asOf, context.facts, parseJsonObject(text));
  explanationCache.set(cacheKey, {
    expiresAt: Date.now() + 1000 * 60 * 15,
    value: normalized
  });
  return normalized;
}

function unavailable(section: AiSection, asOf: string, reason: string, facts: string[] = []): AiExplanation {
  return {
    section,
    available: false,
    asOf,
    summary: reason,
    bullets: [],
    caveats: ["AI explanation is intentionally blocked until the required structured data is present."],
    groundedFacts: facts,
    reason
  };
}

function buildSummaryContext(symbol: string, overview: LiveOverviewRow): ExplanationContext {
  const facts = [
    `${overview.company_name} trades on ${overview.exchange} in ${overview.sector}.`,
    overview.close !== null ? `Latest stored close is ${overview.close.toFixed(2)}.` : "",
    overview.day_change_pct !== null ? `Day change is ${overview.day_change_pct.toFixed(2)}%.` : "",
    overview.market_cap_cr !== null ? `Market cap is ${overview.market_cap_cr.toFixed(2)} crore.` : "",
    overview.technical_summary ? compactText(overview.technical_summary, 140) : "",
    overview.behavior_narrative ? compactText(overview.behavior_narrative, 140) : ""
  ].filter(Boolean);

  return {
    symbol,
    companyName: overview.company_name,
    section: "summary",
    asOf: overview.snapshot_date || new Date().toISOString().slice(0, 10),
    promptLabel: "Overview summary",
    facts,
    payload: {
      overview,
      technicalEvents: asStringArray(overview.technical_events)
    }
  };
}

function buildFundamentalsContext(
  symbol: string,
  overview: LiveOverviewRow,
  yearly: LiveFinancialRow[],
  quarterly: LiveFinancialRow[],
  segments: LiveMixRow[],
  geography: LiveMixRow[],
  peers: LivePeerRow[],
  notes: LiveNoteRow[]
): ExplanationContext | null {
  if (!yearly.length && !quarterly.length && !segments.length && !peers.length) {
    return null;
  }

  const latestYear = yearly.at(-1);
  const facts = [
    latestYear?.revenue_cr !== null && latestYear?.revenue_cr !== undefined ? `Latest yearly revenue is ${latestYear.revenue_cr.toFixed(2)} crore.` : "",
    latestYear?.ebitda_margin_pct !== null && latestYear?.ebitda_margin_pct !== undefined ? `Latest EBITDA margin is ${latestYear.ebitda_margin_pct.toFixed(1)}%.` : "",
    latestYear?.roe_pct !== null && latestYear?.roe_pct !== undefined ? `Latest ROE is ${latestYear.roe_pct.toFixed(1)}%.` : "",
    latestYear?.roce_pct !== null && latestYear?.roce_pct !== undefined ? `Latest ROCE is ${latestYear.roce_pct.toFixed(1)}%.` : "",
    segments[0] ? `Largest segment is ${segments[0].label} at ${segments[0].value_pct.toFixed(1)}%.` : "",
    geography[0]
      ? `Largest geography is ${geography[0].label} at ${geography[0].value_pct.toFixed(1)}%.`
      : ""
  ].filter(Boolean);

  return {
    symbol,
    companyName: overview.company_name,
    section: "fundamentals",
    asOf: overview.snapshot_date || new Date().toISOString().slice(0, 10),
    promptLabel: "Fundamentals interpretation",
    facts,
    payload: {
      headline: overview.fundamentals_headline,
      latestYear,
      latestQuarter: quarterly.at(-1),
      segmentMix: segments.slice(0, 4),
      geographyMix: geography.slice(0, 4),
      peerComparison: peers.slice(0, 4),
      filingNotes: notes.slice(0, 3)
    }
  };
}

function buildTechnicalsContext(
  symbol: string,
  overview: LiveOverviewRow,
  technical: LiveTechnicalRow | null,
  priceLevels: LivePriceLevelRow[]
): ExplanationContext | null {
  if (!technical) {
    return null;
  }

  const facts = [
    `Trend state is ${technical.trend_state || "Mixed"}.`,
    technical.sma_20 !== null ? `20DMA is ${technical.sma_20.toFixed(2)}.` : "",
    technical.rsi_14 !== null ? `RSI 14 is ${technical.rsi_14.toFixed(1)}.` : "",
    priceLevels[0]
      ? `${priceLevels[0].label} is ${priceLevels[0].value.toFixed(2)}.`
      : "",
    priceLevels[1]
      ? `${priceLevels[1].label} is ${priceLevels[1].value.toFixed(2)}.`
      : "",
    overview.close !== null ? `Latest stored close is ${overview.close.toFixed(2)}.` : ""
  ].filter(Boolean);

  return {
    symbol,
    companyName: overview.company_name,
    section: "technicals",
    asOf: technical.price_date,
    promptLabel: "Technical interpretation",
    facts,
    payload: {
      technical,
      priceLevels,
      technicalEvents: asStringArray(technical.technical_events)
    }
  };
}

function buildStrategiesContext(
  symbol: string,
  overview: LiveOverviewRow,
  strategies: LiveStrategyRow[],
  scenarios: LiveScenarioRow[]
): ExplanationContext | null {
  if (!strategies.length && !scenarios.length) {
    return null;
  }

  const topStrategy = strategies[0];
  const topScenario = scenarios[0];
  const facts = [
    topStrategy
      ? `${topStrategy.strategy_name} is ${topStrategy.matched ? "matched" : "watch only"} at ${topStrategy.confidence_pct.toFixed(0)}% confidence.`
      : "",
    topStrategy ? `Invalidation: ${topStrategy.invalidation}` : "",
    topScenario ? `${topScenario.stance} scenario confidence is ${topScenario.confidence_pct.toFixed(0)}%.` : "",
    topScenario ? `Scenario trigger: ${topScenario.trigger_condition}` : ""
  ].filter(Boolean);

  return {
    symbol,
    companyName: overview.company_name,
    section: "strategies",
    asOf: overview.snapshot_date || new Date().toISOString().slice(0, 10),
    promptLabel: "Strategies and scenarios interpretation",
    facts,
    payload: {
      strategies: strategies.slice(0, 5),
      scenarios: scenarios.slice(0, 3)
    }
  };
}

async function buildSectionContext(symbol: string, section: AiSection) {
  const overview = await selectSingle<LiveOverviewRow>("app_stock_overview", symbol);
  const fallbackAsOf = new Date().toISOString().slice(0, 10);

  if (!overview?.snapshot_date) {
    return {
      context: null,
      asOf: fallbackAsOf,
      reason: "Live structured rows are not available for this symbol yet."
    };
  }

  if (section === "summary") {
    return { context: buildSummaryContext(symbol, overview), asOf: overview.snapshot_date };
  }

  if (section === "fundamentals") {
    const [yearly, quarterly, segments, geography, peers, notes] = await Promise.all([
      selectRows<LiveFinancialRow>("app_financials_yearly", symbol, { orderBy: "period", ascending: true }),
      selectRows<LiveFinancialRow>("app_financials_quarterly", symbol, { orderBy: "period", ascending: true }),
      selectRows<LiveMixRow>("app_segment_mix", symbol),
      selectRows<LiveMixRow>("app_geography_mix", symbol),
      selectRows<LivePeerRow>("app_peer_comparison", symbol, {
        applySymbolFilter: false,
        filters: [{ column: "basis_symbol", value: symbol.toUpperCase() }]
      }),
      selectRows<LiveNoteRow>("app_business_notes", symbol, { limit: 4, orderBy: "created_at", ascending: false })
    ]);

    return {
      context: buildFundamentalsContext(symbol, overview, yearly, quarterly, segments, geography, peers, notes),
      asOf: overview.snapshot_date,
      reason: "Required structured fundamentals are not available yet."
    };
  }

  if (section === "technicals") {
    const [technical, priceLevels] = await Promise.all([
      selectSingle<LiveTechnicalRow>("app_technical_snapshot", symbol),
      selectRows<LivePriceLevelRow>("app_price_levels", symbol)
    ]);

    return {
      context: buildTechnicalsContext(symbol, overview, technical, priceLevels),
      asOf: overview.snapshot_date,
      reason: "Required structured technical rows are not available yet."
    };
  }

  const [strategies, scenarios] = await Promise.all([
    selectRows<LiveStrategyRow>("app_strategy_evaluations", symbol, { orderBy: "confidence_pct", ascending: false }),
    selectRows<LiveScenarioRow>("app_scenarios", symbol, { orderBy: "confidence_pct", ascending: false })
  ]);

  return {
    context: buildStrategiesContext(symbol, overview, strategies, scenarios),
    asOf: overview.snapshot_date,
    reason: "Required strategy or scenario rows are not available yet."
  };
}

async function explainSection(symbol: string, section: AiSection): Promise<AiExplanation> {
  const { context, asOf, reason } = await buildSectionContext(symbol, section);

  if (!hasAiKey()) {
    return unavailable(section, asOf, "Gemini API key is not configured.");
  }

  if (!context) {
    return unavailable(section, asOf, reason || "Required structured data for this explanation is not available yet.");
  }

  try {
    return await callGemini(context);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI explanation failed.";
    return unavailable(section, context.asOf, reason, context.facts.slice(0, 4));
  }
}

export async function getAiExplanation(symbol: string, section: AiSection, bundle?: StockBundle | null) {
  void bundle;
  return explainSection(symbol.toUpperCase(), section);
}

export async function getAiExplanationSet(symbol: string, bundle?: StockBundle | null) {
  void bundle;
  const [summary, fundamentals, technicals, strategies] = await Promise.all([
    explainSection(symbol.toUpperCase(), "summary"),
    explainSection(symbol.toUpperCase(), "fundamentals"),
    explainSection(symbol.toUpperCase(), "technicals"),
    explainSection(symbol.toUpperCase(), "strategies")
  ]);

  return {
    summary,
    fundamentals,
    technicals,
    strategies
  };
}
