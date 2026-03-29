export type Tone = "positive" | "neutral" | "caution";
export type Period = "quarterly" | "yearly";

export type CompanySummary = {
  symbol: string;
  companyName: string;
  exchange: "NSE" | "BSE";
  sector: string;
  industry: string;
  summary: string;
  tags: string[];
  lastUpdated: string;
  close: number;
  dayChangePct: number;
  marketCapCr: number;
};

export type SearchResult = {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: "NSE" | "BSE";
  tags: string[];
};

export type MetricCard = {
  label: string;
  value: string;
  change?: string;
  hint?: string;
  tone?: Tone;
};

export type RevenueSplit = {
  label: string;
  valuePct: number;
};

export type PeerRow = {
  symbol: string;
  companyName: string;
  marketCapCr: number;
  pe: number;
  roe: number;
  revenueGrowthPct: number;
  oneYearReturnPct: number;
};

export type FinancialLine = {
  period: string;
  revenueCr: number;
  ebitdaMarginPct: number;
  patMarginPct: number;
  roePct: number;
  rocePct: number;
  netDebtToEbitda: number;
};

export type FundamentalsSnapshot = {
  headline: string;
  metricCards: MetricCard[];
  yearly: FinancialLine[];
  quarterly: FinancialLine[];
  segmentMix: RevenueSplit[];
  geographyMix: RevenueSplit[];
  peerComparison: PeerRow[];
  filingNotes: string[];
};

export type PricePoint = {
  date: string;
  close: number;
  volume: number;
};

export type TechnicalIndicator = {
  name: string;
  value: string;
  interpretation: string;
  tone: Tone;
};

export type PriceLevel = {
  label: string;
  value: number;
  reason: string;
};

export type TechnicalSnapshot = {
  trendState: string;
  summary: string;
  indicators: TechnicalIndicator[];
  prices: PricePoint[];
  supportResistance: PriceLevel[];
  events: string[];
};

export type NewsArticle = {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  relevance: "high" | "medium" | "low";
  impactScore: number;
  sentiment: "positive" | "neutral" | "negative";
  whyItMatters: string;
};

export type EventItem = {
  id: string;
  title: string;
  eventDate: string;
  category: string;
  note: string;
};

export type BehaviorScore = {
  label: string;
  value: number;
  interpretation: string;
};

export type BehaviorSnapshot = {
  narrative: string;
  scores: BehaviorScore[];
};

export type StrategyEvaluation = {
  id: string;
  strategyName: string;
  matched: boolean;
  confidencePct: number;
  support: string[];
  invalidation: string;
  explanation: string;
};

export type Scenario = {
  id: string;
  title: string;
  stance: "Bullish" | "Neutral" | "Bearish";
  confidencePct: number;
  trigger: string;
  invalidation: string;
  payoffFrame: string;
  explanation: string;
};

export type PatternMatch = {
  id: string;
  patternName: string;
  confidencePct: number;
  note: string;
  similarCases: string[];
};

export type MarketSummary = {
  lastUpdated: string;
  headline: string;
  breadth: string;
  leaders: string[];
  caution: string;
};

export type SourceStatus = {
  adapter: string;
  freshness: string;
  status: "healthy" | "degraded" | "warning" | "stale";
  note: string;
};

export type IngestionJob = {
  id: string;
  source: string;
  target: string;
  status: "queued" | "running" | "success" | "warning";
  startedAt: string;
  finishedAt?: string;
  note: string;
};

export type SourceRun = {
  id: string;
  adapter: string;
  sourceType: string;
  status: "healthy" | "degraded" | "warning" | "stale" | "success" | "failed" | "running";
  startedAt: string;
  finishedAt?: string;
  detail: string;
};

export type DataQualityIssue = {
  id: string;
  adapter: string;
  issueType: string;
  detail: string;
  resolved: boolean;
  createdAt: string;
};

export type AdminOverview = {
  totalSources: number;
  healthySources: number;
  warningSources: number;
  degradedSources: number;
  staleSources: number;
  totalJobs: number;
  runningJobs: number;
  queuedJobs: number;
  warningJobs: number;
  successJobs: number;
  openIssues: number;
  resolvedIssues: number;
  latestRunStartedAt?: string;
  latestActivityAt?: string;
};

export type StockBundle = {
  overview: CompanySummary;
  fundamentals: FundamentalsSnapshot;
  technicals: TechnicalSnapshot;
  news: NewsArticle[];
  events: EventItem[];
  behavior: BehaviorSnapshot;
  strategies: StrategyEvaluation[];
  scenarios: Scenario[];
  patterns: PatternMatch[];
};
