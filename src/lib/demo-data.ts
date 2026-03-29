import {
  type EventItem,
  type IngestionJob,
  type MarketSummary,
  type PatternMatch,
  type PeerRow,
  type SearchResult,
  type SourceStatus,
  type StockBundle
} from "@/lib/contracts";

const marchDates = [
  "2026-03-02",
  "2026-03-03",
  "2026-03-04",
  "2026-03-05",
  "2026-03-06",
  "2026-03-09",
  "2026-03-10",
  "2026-03-11",
  "2026-03-12",
  "2026-03-13",
  "2026-03-16",
  "2026-03-17",
  "2026-03-18",
  "2026-03-19",
  "2026-03-20",
  "2026-03-23",
  "2026-03-24",
  "2026-03-25",
  "2026-03-26",
  "2026-03-27"
] as const;

function series(base: number, shifts: number[]) {
  return marchDates.map((date, index) => ({
    date,
    close: Number((base + shifts[index]).toFixed(2)),
    volume: 1_800_000 + index * 85_000
  }));
}

const peerRows: PeerRow[] = [
  {
    symbol: "RELIANCE",
    companyName: "Reliance Industries",
    marketCapCr: 2050000,
    pe: 24.6,
    roe: 10.9,
    revenueGrowthPct: 8.1,
    oneYearReturnPct: 19.2
  },
  {
    symbol: "TCS",
    companyName: "Tata Consultancy Services",
    marketCapCr: 1520000,
    pe: 29.4,
    roe: 46.8,
    revenueGrowthPct: 10.6,
    oneYearReturnPct: 15.5
  },
  {
    symbol: "INFY",
    companyName: "Infosys",
    marketCapCr: 790000,
    pe: 27.3,
    roe: 31.4,
    revenueGrowthPct: 9.4,
    oneYearReturnPct: 11.8
  }
];

export const stockBundles: Record<string, StockBundle> = {
  RELIANCE: {
    overview: {
      symbol: "RELIANCE",
      companyName: "Reliance Industries",
      exchange: "NSE",
      sector: "Energy",
      industry: "Integrated Oil, Retail, Telecom",
      summary:
        "Reliance combines consumer, digital, and energy businesses, giving the stock multiple profit engines and several moving parts for the market to price.",
      tags: ["Large cap", "Retail optionality", "Energy cash flows"],
      lastUpdated: "2026-03-27",
      close: 3021.6,
      dayChangePct: 1.82,
      marketCapCr: 2050000
    },
    fundamentals: {
      headline:
        "Revenue mix remains diversified, but the current margin story still depends on telecom monetization and retail operating leverage continuing to improve.",
      metricCards: [
        { label: "Revenue Growth", value: "8.1%", change: "+120 bps", tone: "positive" },
        { label: "EBITDA Margin", value: "17.6%", change: "+40 bps", tone: "positive" },
        { label: "ROE", value: "10.9%", hint: "Still below top-tier compounders", tone: "neutral" },
        { label: "Net Debt / EBITDA", value: "1.3x", hint: "Manageable for the asset base", tone: "neutral" },
        { label: "ROCE", value: "9.8%", change: "+30 bps", tone: "positive" },
        { label: "PAT Margin", value: "7.3%", hint: "Improving with retail scale", tone: "positive" }
      ],
      yearly: [
        { period: "FY24", revenueCr: 902341, ebitdaMarginPct: 16.7, patMarginPct: 6.8, roePct: 10.2, rocePct: 9.1, netDebtToEbitda: 1.5 },
        { period: "FY25", revenueCr: 958410, ebitdaMarginPct: 17.2, patMarginPct: 7.1, roePct: 10.6, rocePct: 9.5, netDebtToEbitda: 1.4 },
        { period: "FY26E", revenueCr: 1035220, ebitdaMarginPct: 17.6, patMarginPct: 7.3, roePct: 10.9, rocePct: 9.8, netDebtToEbitda: 1.3 }
      ],
      quarterly: [
        { period: "Q2 FY26", revenueCr: 253100, ebitdaMarginPct: 17.1, patMarginPct: 7.0, roePct: 10.5, rocePct: 9.3, netDebtToEbitda: 1.4 },
        { period: "Q3 FY26", revenueCr: 259880, ebitdaMarginPct: 17.4, patMarginPct: 7.2, roePct: 10.7, rocePct: 9.6, netDebtToEbitda: 1.4 },
        { period: "Q4 FY26E", revenueCr: 264200, ebitdaMarginPct: 17.6, patMarginPct: 7.3, roePct: 10.9, rocePct: 9.8, netDebtToEbitda: 1.3 }
      ],
      segmentMix: [
        { label: "Oil to Chemicals", valuePct: 42 },
        { label: "Retail", valuePct: 27 },
        { label: "Digital Services", valuePct: 23 },
        { label: "Others", valuePct: 8 }
      ],
      geographyMix: [
        { label: "India", valuePct: 78 },
        { label: "Asia ex-India", valuePct: 11 },
        { label: "Europe", valuePct: 6 },
        { label: "Americas", valuePct: 5 }
      ],
      peerComparison: peerRows,
      filingNotes: [
        "Retail same-store growth recovered sequentially, which matters for operating leverage.",
        "Telecom monetization remains the main bridge from scale to higher consolidated return ratios.",
        "Capex intensity still needs monitoring because balance-sheet comfort is good, not perfect."
      ]
    },
    technicals: {
      trendState: "Bullish with range expansion",
      summary:
        "Price is above the 20DMA, 50DMA, and 200DMA, and volume has supported the latest breakout attempt rather than fading immediately.",
      indicators: [
        { name: "20DMA", value: "2968.2", interpretation: "Price is holding above the short-term trend line.", tone: "positive" },
        { name: "50DMA", value: "2894.1", interpretation: "Intermediate trend remains constructive.", tone: "positive" },
        { name: "200DMA", value: "2750.3", interpretation: "Long-term structure is still intact.", tone: "positive" },
        { name: "RSI (14)", value: "63.4", interpretation: "Momentum is firm but not yet stretched.", tone: "positive" },
        { name: "MACD", value: "+18.7", interpretation: "Momentum line remains above signal, supporting continuation.", tone: "positive" },
        { name: "ATR", value: "48.5", interpretation: "Volatility is elevated enough to keep risk framing wide.", tone: "neutral" }
      ],
      prices: series(2865, [-22, -14, -19, -12, -6, 2, 8, 13, 10, 15, 22, 28, 20, 26, 31, 38, 52, 57, 71, 156.6]),
      supportResistance: [
        { label: "Primary Support", value: 2960, reason: "Recent breakout retest zone" },
        { label: "Major Support", value: 2890, reason: "50DMA cluster" },
        { label: "Immediate Resistance", value: 3050, reason: "Recent swing high" }
      ],
      events: [
        "Golden-cross style alignment remains intact across major moving averages.",
        "Breakout candle expanded on stronger-than-average volume.",
        "No fresh bearish divergence is visible on the current swing."
      ]
    },
    news: [
      {
        id: "news-rel-1",
        headline: "Reliance retail expansion commentary points to improving discretionary demand",
        source: "Business Standard",
        publishedAt: "2026-03-27T08:30:00+05:30",
        relevance: "high",
        impactScore: 78,
        sentiment: "positive",
        whyItMatters:
          "The market is reading stronger store-level commentary as evidence that retail profitability can widen, which improves the margin narrative behind the stock."
      },
      {
        id: "news-rel-2",
        headline: "Energy margin outlook stays mixed as global crack spreads soften",
        source: "Mint",
        publishedAt: "2026-03-26T16:10:00+05:30",
        relevance: "medium",
        impactScore: 54,
        sentiment: "neutral",
        whyItMatters:
          "This matters because energy cash flows still fund a large part of the group’s optionality, even though consumer businesses carry the rerating story."
      }
    ],
    events: [
      {
        id: "event-rel-1",
        title: "Q4 FY26 result window",
        eventDate: "2026-04-19",
        category: "Earnings",
        note: "Monitor retail margin and telecom ARPU commentary."
      },
      {
        id: "event-rel-2",
        title: "Annual report release",
        eventDate: "2026-05-10",
        category: "Filing",
        note: "Update business model map and segment notes from management commentary."
      }
    ],
    behavior: {
      narrative:
        "Reliance is behaving like a high-liquidity trend stock: market-linked on broad moves, but still capable of company-specific acceleration when consumer or telecom narratives improve.",
      scores: [
        { label: "Momentum Sensitivity", value: 71, interpretation: "Momentum is improving fast enough to support continuation setups." },
        { label: "Acceleration", value: 67, interpretation: "Slope has steepened during the latest advance." },
        { label: "Trend Decay", value: 28, interpretation: "Trend has not shown meaningful weakening yet." },
        { label: "Volatility Sensitivity", value: 56, interpretation: "Volatility spikes matter, but the stock is not acting fragile." },
        { label: "Market Linkage", value: 62, interpretation: "Broad index strength still explains part of the move." }
      ]
    },
    strategies: [
      {
        id: "rel-strategy-1",
        strategyName: "Trend Continuation",
        matched: true,
        confidencePct: 78,
        support: ["Price above 20DMA/50DMA/200DMA", "RSI in healthy expansion zone", "Breakout volume confirmed"],
        invalidation: "Daily close back below 2960 with weakening volume support.",
        explanation:
          "This setup matches a continuation structure because the trend is aligned across timeframes and momentum is expanding without a clearly overbought reversal signal."
      },
      {
        id: "rel-strategy-2",
        strategyName: "Breakout Confirmation",
        matched: true,
        confidencePct: 72,
        support: ["Fresh swing-high test", "Range expansion day", "Follow-through watch level is nearby"],
        invalidation: "Failed follow-through and a quick rejection back into the prior base.",
        explanation:
          "The stock is in the right neighborhood for a breakout confirmation, but the strongest confirmation still depends on holding above resistance after the first thrust."
      },
      {
        id: "rel-strategy-3",
        strategyName: "Mean Reversion Watchlist",
        matched: false,
        confidencePct: 29,
        support: ["Momentum is positive", "No oversold condition"],
        invalidation: "Not applicable while the stock remains in expansion mode.",
        explanation:
          "This does not fit a mean-reversion watchlist because the setup is trending rather than washed out."
      },
      {
        id: "rel-strategy-4",
        strategyName: "Quality + Momentum",
        matched: true,
        confidencePct: 66,
        support: ["Large-cap quality profile", "Improving profitability", "Trend alignment remains positive"],
        invalidation: "Return ratios stall while price underperforms peers.",
        explanation:
          "It qualifies as a hybrid quality-plus-momentum candidate, though the quality score is not as clean as software or consumer compounders."
      },
      {
        id: "rel-strategy-5",
        strategyName: "Event Risk Watch",
        matched: true,
        confidencePct: 61,
        support: ["Earnings window ahead", "Narrative-sensitive retail and telecom commentary", "Breakout near event zone"],
        invalidation: "Event passes without material guidance change.",
        explanation:
          "Upcoming earnings create event sensitivity because the market still needs evidence that consumer and telecom segments are lifting returns fast enough."
      }
    ],
    scenarios: [
      {
        id: "rel-scenario-1",
        title: "Bullish continuation above breakout shelf",
        stance: "Bullish",
        confidencePct: 74,
        trigger: "Sustained closes above 3050 with RSI staying above 60.",
        invalidation: "Loss of 2960 support on closing basis.",
        payoffFrame: "Favors continuation toward the next leg if market breadth stays supportive.",
        explanation:
          "The chart already has strong alignment, so a stable hold above the breakout shelf would convert strength into a cleaner continuation structure."
      },
      {
        id: "rel-scenario-2",
        title: "Range reset before the next move",
        stance: "Neutral",
        confidencePct: 52,
        trigger: "Price oscillates between 2960 and 3050 as momentum cools.",
        invalidation: "Convincing expansion outside the range.",
        payoffFrame: "Useful for patience rather than urgency.",
        explanation:
          "This would be a normal digestion outcome after a sharp move, especially if the market pauses near quarter-end."
      },
      {
        id: "rel-scenario-3",
        title: "Failed breakout into deeper retest",
        stance: "Bearish",
        confidencePct: 34,
        trigger: "Breakout rejection followed by closes below 2960.",
        invalidation: "Immediate recovery back above the breakout shelf.",
        payoffFrame: "Risk rises because a failed breakout can unwind quickly into the 50DMA zone.",
        explanation:
          "This is lower probability today, but still important because event-driven stocks can reverse hard when the narrative wobbles."
      }
    ],
    patterns: [
      {
        id: "rel-pattern-1",
        patternName: "Ascending base",
        confidencePct: 76,
        note: "Price compressed upward before attempting range expansion.",
        similarCases: ["2024 consumer rerating breakout", "2025 telecom expansion leg"]
      }
    ]
  }
};

stockBundles.TCS = {
  overview: {
    symbol: "TCS",
    companyName: "Tata Consultancy Services",
    exchange: "NSE",
    sector: "Information Technology",
    industry: "IT Services",
    summary:
      "TCS is a quality compounder with strong margins, sticky enterprise clients, and relatively defensive cash generation.",
    tags: ["High quality", "Cash rich", "Margin resilient"],
    lastUpdated: "2026-03-27",
    close: 4315.25,
    dayChangePct: 0.64,
    marketCapCr: 1520000
  },
  fundamentals: {
    headline:
      "TCS remains a quality benchmark: margins are steady, client stickiness is strong, and the market still values its predictability.",
    metricCards: [
      { label: "Revenue Growth", value: "10.6%", change: "+80 bps", tone: "positive" },
      { label: "EBITDA Margin", value: "26.1%", hint: "Healthy for the sector", tone: "positive" },
      { label: "ROE", value: "46.8%", hint: "Elite capital efficiency", tone: "positive" },
      { label: "Net Cash", value: "Rs 67k Cr", hint: "Balance sheet strength", tone: "positive" },
      { label: "ROCE", value: "58.3%", tone: "positive" },
      { label: "Attrition", value: "12.9%", hint: "Under control", tone: "neutral" }
    ],
    yearly: [
      { period: "FY24", revenueCr: 240893, ebitdaMarginPct: 25.2, patMarginPct: 19.1, roePct: 45.6, rocePct: 56.2, netDebtToEbitda: -0.4 },
      { period: "FY25", revenueCr: 258420, ebitdaMarginPct: 25.7, patMarginPct: 19.5, roePct: 46.1, rocePct: 57.4, netDebtToEbitda: -0.5 },
      { period: "FY26E", revenueCr: 285800, ebitdaMarginPct: 26.1, patMarginPct: 19.8, roePct: 46.8, rocePct: 58.3, netDebtToEbitda: -0.6 }
    ],
    quarterly: [
      { period: "Q2 FY26", revenueCr: 69440, ebitdaMarginPct: 25.7, patMarginPct: 19.4, roePct: 46.0, rocePct: 57.2, netDebtToEbitda: -0.5 },
      { period: "Q3 FY26", revenueCr: 71200, ebitdaMarginPct: 25.9, patMarginPct: 19.7, roePct: 46.4, rocePct: 57.9, netDebtToEbitda: -0.5 },
      { period: "Q4 FY26E", revenueCr: 72400, ebitdaMarginPct: 26.1, patMarginPct: 19.8, roePct: 46.8, rocePct: 58.3, netDebtToEbitda: -0.6 }
    ],
    segmentMix: [
      { label: "BFSI", valuePct: 33 },
      { label: "Retail & CPG", valuePct: 16 },
      { label: "Manufacturing", valuePct: 13 },
      { label: "Others", valuePct: 38 }
    ],
    geographyMix: [
      { label: "North America", valuePct: 51 },
      { label: "UK", valuePct: 17 },
      { label: "Continental Europe", valuePct: 15 },
      { label: "Rest of World", valuePct: 17 }
    ],
    peerComparison: peerRows,
    filingNotes: [
      "Client mining and large-deal conversion continue to matter more than short-term discretionary softness.",
      "Margin resilience remains the quality anchor for the stock.",
      "Currency and BFSI commentary should stay in the monitoring set."
    ]
  },
  technicals: {
    trendState: "Constructive but slower",
    summary:
      "TCS is trending upward, but the slope is steadier than momentum names. It behaves more like a quality compounder than a breakout chaser.",
    indicators: [
      { name: "20DMA", value: "4258.4", interpretation: "Short-term trend is supportive.", tone: "positive" },
      { name: "50DMA", value: "4191.6", interpretation: "Intermediate structure is stable.", tone: "positive" },
      { name: "200DMA", value: "3980.8", interpretation: "Long-term trend remains healthy.", tone: "positive" },
      { name: "RSI (14)", value: "58.1", interpretation: "Momentum is positive but measured.", tone: "positive" },
      { name: "MACD", value: "+9.4", interpretation: "Positive spread without aggressive acceleration.", tone: "neutral" },
      { name: "ATR", value: "44.8", interpretation: "Volatility remains contained for a large-cap IT name.", tone: "neutral" }
    ],
    prices: series(4100, [-18, -9, 3, 7, 4, 12, 18, 24, 29, 31, 36, 42, 38, 51, 59, 66, 72, 79, 90, 215.25]),
    supportResistance: [
      { label: "Primary Support", value: 4250, reason: "20DMA and prior pivot" },
      { label: "Major Support", value: 4190, reason: "50DMA zone" },
      { label: "Immediate Resistance", value: 4350, reason: "Recent swing high shelf" }
    ],
    events: [
      "Trend is positive, but follow-through tends to be steadier than explosive.",
      "Relative strength versus IT peers has improved modestly.",
      "No major exhaustion signal is visible yet."
    ]
  },
  news: [
    {
      id: "news-tcs-1",
      headline: "Large-deal wins help support TCS growth visibility into next fiscal year",
      source: "Economic Times",
      publishedAt: "2026-03-27T09:15:00+05:30",
      relevance: "high",
      impactScore: 74,
      sentiment: "positive",
      whyItMatters:
        "The market tends to reward TCS when large deals reinforce revenue visibility, especially in slower discretionary spending periods."
    }
  ],
  events: [
    {
      id: "event-tcs-1",
      title: "Q4 FY26 result date",
      eventDate: "2026-04-12",
      category: "Earnings",
      note: "Watch deal pipeline, margin commentary, and BFSI demand."
    }
  ],
  behavior: {
    narrative:
      "TCS behaves like a stable quality trend: lower noise, slower acceleration, and stronger resilience when broader sentiment gets choppy.",
    scores: [
      { label: "Momentum Sensitivity", value: 59, interpretation: "Momentum builds, but usually in a measured way." },
      { label: "Acceleration", value: 48, interpretation: "Trend is steady rather than explosive." },
      { label: "Trend Decay", value: 24, interpretation: "Trend weakening remains limited." },
      { label: "Volatility Sensitivity", value: 34, interpretation: "The stock is not highly fragile to volatility shocks." },
      { label: "Market Linkage", value: 44, interpretation: "Company quality often matters more than index beta alone." }
    ]
  },
  strategies: [
    {
      id: "tcs-strategy-1",
      strategyName: "Quality + Momentum",
      matched: true,
      confidencePct: 82,
      support: ["High ROE and ROCE", "Healthy trend alignment", "Cash-rich balance sheet"],
      invalidation: "Loss of quality narrative or persistent peer underperformance.",
      explanation:
        "TCS is a strong match for quality plus momentum because fundamentals and trend structure are both supportive without requiring a high-risk narrative leap."
    },
    {
      id: "tcs-strategy-2",
      strategyName: "Trend Continuation",
      matched: true,
      confidencePct: 64,
      support: ["Price above key moving averages", "Measured momentum expansion"],
      invalidation: "Close below 4250 with weakening relative strength.",
      explanation:
        "The trend remains positive, though it is a slower continuation profile than a fast breakout profile."
    },
    {
      id: "tcs-strategy-3",
      strategyName: "Event Risk Watch",
      matched: true,
      confidencePct: 58,
      support: ["Earnings ahead", "Deal commentary sensitivity"],
      invalidation: "Event passes with no material guidance surprise.",
      explanation:
        "Results matter because the market still needs confirmation that growth visibility and margin discipline remain intact."
    },
    {
      id: "tcs-strategy-4",
      strategyName: "Mean Reversion Watchlist",
      matched: false,
      confidencePct: 18,
      support: ["No oversold setup present"],
      invalidation: "Not applicable in current trend state.",
      explanation:
        "This is not a mean-reversion candidate because price is not in a stressed or oversold reset."
    },
    {
      id: "tcs-strategy-5",
      strategyName: "Breakout Confirmation",
      matched: false,
      confidencePct: 41,
      support: ["Approaching resistance but without explosive expansion"],
      invalidation: "Not applicable unless a clean range break appears.",
      explanation:
        "TCS is nearer to orderly trend continuation than a high-energy breakout confirmation setup."
    }
  ],
  scenarios: [
    {
      id: "tcs-scenario-1",
      title: "Quality continuation after earnings",
      stance: "Bullish",
      confidencePct: 69,
      trigger: "Healthy deal wins and stable margins with price holding above 4250.",
      invalidation: "Weak guidance and a close below 4190.",
      payoffFrame: "Supports a slow-grind continuation profile.",
      explanation:
        "The bullish path depends more on predictability than excitement, which is typical for TCS."
    },
    {
      id: "tcs-scenario-2",
      title: "Sideways consolidation into results",
      stance: "Neutral",
      confidencePct: 57,
      trigger: "Price stays between 4250 and 4350 ahead of earnings.",
      invalidation: "Decisive move outside the range.",
      payoffFrame: "Favors patience and post-event clarity.",
      explanation:
        "A neutral pause would be normal given the current measured trend slope."
    },
    {
      id: "tcs-scenario-3",
      title: "Defensive drift lower on soft guidance",
      stance: "Bearish",
      confidencePct: 31,
      trigger: "Guidance softens and price loses 4190 support.",
      invalidation: "Immediate recovery above the 20DMA after the event.",
      payoffFrame: "Would likely be orderly rather than disorderly.",
      explanation:
        "The bearish path is lower probability but still relevant because the stock’s premium multiple depends on trust."
    }
  ],
  patterns: [
    {
      id: "tcs-pattern-1",
      patternName: "Rising channel",
      confidencePct: 63,
      note: "Trend is steady, orderly, and less explosive than a breakout base.",
      similarCases: ["2025 post-deal-win grind", "2024 margin resilience rally"]
    }
  ]
};

stockBundles.INFY = {
  ...stockBundles.TCS,
  overview: {
    symbol: "INFY",
    companyName: "Infosys",
    exchange: "NSE",
    sector: "Information Technology",
    industry: "IT Services",
    summary:
      "Infosys offers global services exposure with improving execution and balanced exposure across digital transformation programs.",
    tags: ["Digital services", "USD revenue", "Execution monitor"],
    lastUpdated: "2026-03-27",
    close: 1884.4,
    dayChangePct: -0.25,
    marketCapCr: 790000
  }
};

export const marketSummary: MarketSummary = {
  lastUpdated: "2026-03-27",
  headline: "Risk appetite improved into the close, led by large-cap quality and selective consumer narratives.",
  breadth: "Breadth improved, but leadership still looks concentrated in liquid large caps.",
  leaders: ["Reliance Industries", "TCS", "ICICI Bank"],
  caution: "Event-heavy names still deserve wider risk framing because earnings season is close."
};

export const sourceStatuses: SourceStatus[] = [
  {
    adapter: "NSE EOD",
    freshness: "Updated after 2026-03-27 close",
    status: "healthy",
    note: "Daily price and security master refresh completed."
  },
  {
    adapter: "BSE Bhav Copy",
    freshness: "Updated after 2026-03-27 close",
    status: "healthy",
    note: "Cross-exchange symbol mapping reconciled."
  },
  {
    adapter: "MCA Filings",
    freshness: "Backfill lag 1 day",
    status: "warning",
    note: "Queued annual report extraction jobs remain pending."
  },
  {
    adapter: "RBI DBIE",
    freshness: "Weekly snapshot current",
    status: "healthy",
    note: "Macro overlays available for regime context."
  }
];

export const ingestionJobs: IngestionJob[] = [
  {
    id: "job-001",
    source: "NSE",
    target: "market.ohlcv_daily",
    status: "success",
    startedAt: "2026-03-27T18:12:00+05:30",
    finishedAt: "2026-03-27T18:18:00+05:30",
    note: "Imported 2,341 EOD rows and refreshed security master joins."
  },
  {
    id: "job-002",
    source: "BSE",
    target: "core.symbols",
    status: "success",
    startedAt: "2026-03-27T18:20:00+05:30",
    finishedAt: "2026-03-27T18:24:00+05:30",
    note: "Exchange mapping delta applied cleanly."
  },
  {
    id: "job-003",
    source: "MCA",
    target: "fundamentals.business_notes",
    status: "warning",
    startedAt: "2026-03-27T18:35:00+05:30",
    note: "Seven filings waiting for document extraction retry."
  }
];

export const learnGlossary = [
  {
    term: "ROE",
    meaning: "Return on Equity shows how efficiently a company converts shareholder capital into profit."
  },
  {
    term: "Trend Decay",
    meaning: "Trend Decay estimates whether a price trend is losing strength even if price has not fallen sharply yet."
  },
  {
    term: "Impact Score",
    meaning: "Impact Score is a structured guess about how strongly the market may care about a news item."
  },
  {
    term: "Invalidation",
    meaning: "Invalidation is the condition that would make a strategy or scenario less reliable."
  }
];

export const searchIndex: SearchResult[] = Object.values(stockBundles).map((company) => ({
  symbol: company.overview.symbol,
  companyName: company.overview.companyName,
  sector: company.overview.sector,
  exchange: company.overview.exchange,
  tags: company.overview.tags
}));

export const featuredPatterns: PatternMatch[] = [
  stockBundles.RELIANCE.patterns[0],
  stockBundles.TCS.patterns[0]
];

export const upcomingEvents: EventItem[] = Object.values(stockBundles).flatMap((stock) => stock.events);
