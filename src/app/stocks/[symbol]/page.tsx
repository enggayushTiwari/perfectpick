import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Sparkline } from "@/components/sparkline";
import { StockTabNav } from "@/components/stock-tab-nav";
import { WatchlistToggle } from "@/components/watchlist-toggle";
import { getAiExplanationSet } from "@/lib/ai";
import type { AiExplanation } from "@/lib/contracts";
import { formatCurrencyCr, formatDateLabel, formatSignedPct } from "@/lib/format";
import { getCorporateActions, getStockBundle } from "@/lib/repositories";

type StockPageProps = {
  params: Promise<{ symbol: string }>;
};

function AiExplanationCard({ explanation, title }: { explanation: AiExplanation; title: string }) {
  return (
    <div className="ai-card">
      <div className="ai-card-header">
        <span className="eyebrow">AI explain</span>
        <span className="muted">As of {explanation.asOf}</span>
      </div>
      <strong>{title}</strong>
      <p>{explanation.summary}</p>
      {explanation.bullets.length ? (
        <ul className="ai-list">
          {explanation.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {explanation.groundedFacts.length ? (
        <div className="stack-list">
          <span className="muted">Grounded facts</span>
          {explanation.groundedFacts.map((fact) => (
            <p key={fact} className="muted">
              {fact}
            </p>
          ))}
        </div>
      ) : null}
      {explanation.caveats.length ? (
        <div className="stack-list">
          <span className="muted">Caveats</span>
          {explanation.caveats.map((item) => (
            <p key={item} className="caution">
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TrustPanel({
  title,
  freshness,
  sourceLabel,
  learn,
  caution
}: {
  title: string;
  freshness: string;
  sourceLabel: string;
  learn: string;
  caution?: string;
}) {
  return (
    <div className="trust-panel">
      <strong>{title}</strong>
      <p className="muted">Freshness: {freshness}</p>
      <p className="muted">Source basis: {sourceLabel}</p>
      <p className="muted">How to read it: {learn}</p>
      {caution ? <p className="caution">{caution}</p> : null}
    </div>
  );
}

function getFreshnessState(date?: string) {
  if (!date) {
    return {
      label: "Unknown freshness",
      tone: "warning" as const
    };
  }

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: date,
      tone: "warning" as const
    };
  }

  const ageDays = Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays <= 2) {
    return {
      label: `Fresh as of ${formatDateLabel(date)}`,
      tone: "fresh" as const
    };
  }

  if (ageDays <= 7) {
    return {
      label: `Recent as of ${formatDateLabel(date)}`,
      tone: "recent" as const
    };
  }

  return {
    label: `Stale since ${formatDateLabel(date)}`,
    tone: "stale" as const
  };
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  const bundle = await getStockBundle(symbol);

  if (!bundle) {
    notFound();
  }

  const ai = await getAiExplanationSet(symbol, bundle);
  const corporateActions = await getCorporateActions(symbol);
  const { overview, fundamentals, technicals, news, behavior, strategies, scenarios } = bundle;
  const overviewFreshness = getFreshnessState(overview.lastUpdated);
  const fundamentalsFreshness = getFreshnessState(fundamentals.asOfDate);
  const technicalsFreshness = getFreshnessState(technicals.asOfDate);
  const behaviorFreshness = getFreshnessState(behavior.asOfDate);
  const strategyFreshness = getFreshnessState(
    strategies[0]?.sourceSnapshotDate ?? scenarios[0]?.sourceSnapshotDate ?? strategies[0]?.evaluationDate ?? scenarios[0]?.evaluationDate
  );
  return (
    <div className="page-stack">
      <section className="stock-hero">
        <div>
          <span className="eyebrow">Supabase-backed research view</span>
          <h1>
            {overview.companyName}
            <br />
            <span className="muted">{overview.symbol}</span>
          </h1>
          <div className="stock-meta">
            <span>{overview.exchange}</span>
            <span>{overview.sector}</span>
            <span>{overview.industry}</span>
            <span>Updated {overview.lastUpdated}</span>
          </div>
        </div>
        <p className="section-copy">{overview.summary}</p>
        <div className="pill-row">
          <div className="pill">
            <strong>{overview.close.toFixed(2)}</strong>
            <span className={overview.dayChangePct >= 0 ? "positive" : "negative"}>
              {formatSignedPct(overview.dayChangePct)}
            </span>
          </div>
          <div className="pill">
            <strong>{formatCurrencyCr(overview.marketCapCr)}</strong>
            <span>Market cap</span>
          </div>
          <div className="pill">
            <strong>{technicals.trendState}</strong>
            <span>Trend state</span>
          </div>
          <div className="pill">
            <WatchlistToggle symbol={overview.symbol} />
          </div>
        </div>
        <div className="stock-meta">
          {overview.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="trust-banner">
          <div className={`trust-panel ${overviewFreshness.tone}`}>
            <strong>Last refresh</strong>
            <p className="muted">{overviewFreshness.label}</p>
          </div>
          <div className="trust-panel">
            <strong>Mode</strong>
            <p className="muted">End-of-day research only</p>
          </div>
          <div className="trust-panel">
            <strong>Trust rule</strong>
            <p className="muted">If a section is missing, the platform says so instead of fabricating confidence.</p>
          </div>
          <div className="trust-panel">
            <strong>Learning layer</strong>
            <p className="muted">Use the Learn page for metric explanations and interpretation basics.</p>
          </div>
        </div>
      </section>

      <StockTabNav />

      <SectionCard title="Overview" eyebrow="Stage 1">
        <div id="overview" className="two-column">
          <div className="stack-list">
            <div className="metric-card">
              <strong>Plain-language summary</strong>
              <p>{fundamentals.headline}</p>
            </div>
            <TrustPanel
              title="Overview trust note"
              freshness={`Company profile updated ${formatDateLabel(overview.lastUpdated)}`}
              sourceLabel="Company directory, stock snapshot, filing-derived notes, and corporate actions"
              learn="Use this section as an orientation layer before moving into fundamentals, technicals, or scenarios."
            />
            <div className="metric-card">
              <strong>Business notes</strong>
              {fundamentals.businessNotes.length ? (
                <div className="stack-list">
                  {fundamentals.businessNotes.map((note) => (
                    <div key={note.id} className="overview-fact">
                      <strong>{note.sourceKind}</strong>
                      <p className="muted">{note.note}</p>
                      {note.sourceExcerpt ? <p className="muted">{note.sourceExcerpt}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No source-backed business notes are loaded yet for this company.</p>
              )}
            </div>
            <div className="metric-card">
              <strong>Corporate actions</strong>
              <div className="stack-list">
                {corporateActions.length ? (
                  corporateActions.slice(0, 4).map((action) => (
                    <p key={action.id} className="muted">
                      {action.actionDate} | {action.actionType}
                    </p>
                  ))
                ) : (
                  <p className="muted">No corporate actions are currently stored for this symbol.</p>
                )}
              </div>
            </div>
            {ai ? <AiExplanationCard explanation={ai.summary} title="Overview interpretation" /> : null}
          </div>
          <div className="metric-grid">
            {fundamentals.metricCards.length ? (
              fundamentals.metricCards.map((metric) => (
                <div key={metric.label} className="metric-card">
                  <span className="muted">{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p
                    className={
                      metric.tone === "positive"
                        ? "positive"
                        : metric.tone === "caution"
                          ? "caution"
                          : "muted"
                    }
                  >
                    {metric.change ?? metric.hint ?? "Structured metric"}
                  </p>
                </div>
              ))
            ) : (
              <div className="metric-card">
                <strong>Awaiting filing-derived metrics</strong>
                <p className="muted">
                  This company is visible live, but the core fundamentals metrics have not been loaded yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Fundamentals" eyebrow="Stage 2">
        <div id="fundamentals" className="two-column">
          <div className="stack-list">
            <div className="metric-card">
              <strong>Coverage status</strong>
              <p className="muted">
                {fundamentals.liveStatus === "live"
                  ? "Yearly lines, mix views, peers, and business notes are live from Supabase."
                  : fundamentals.liveStatus === "partial"
                    ? "Some fundamentals are live, but this company still needs more filing coverage."
                    : "No live fundamentals are loaded yet. Queue annual report, MCA/XBRL, or investor presentation documents to populate this tab."}
              </p>
            </div>
            <TrustPanel
              title="Fundamentals trust note"
              freshness={fundamentalsFreshness.label}
              sourceLabel="Annual reports, investor presentations, MCA/XBRL extraction, and derived ratios"
              learn="Prefer yearly lines for business quality and quarterly lines for direction-of-change."
              caution="Partial coverage usually means some filings or segment disclosures are still missing."
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Revenue (Cr)</th>
                    <th>EBITDA Margin</th>
                    <th>ROE</th>
                    <th>ROCE</th>
                  </tr>
                </thead>
                <tbody>
                  {fundamentals.yearly.length ? (
                    fundamentals.yearly.map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{row.revenueCr.toLocaleString("en-IN")}</td>
                        <td>{row.ebitdaMarginPct}%</td>
                        <td>{row.roePct}%</td>
                        <td>{row.rocePct}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        No yearly financial lines are stored yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quarter</th>
                    <th>Revenue (Cr)</th>
                    <th>EBITDA Margin</th>
                    <th>ROE</th>
                    <th>ROCE</th>
                  </tr>
                </thead>
                <tbody>
                  {fundamentals.quarterly.length ? (
                    fundamentals.quarterly.map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{row.revenueCr.toLocaleString("en-IN")}</td>
                        <td>{row.ebitdaMarginPct}%</td>
                        <td>{row.roePct}%</td>
                        <td>{row.rocePct}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        No quarterly financial lines are stored yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="two-column">
            <div className="metric-card">
              <strong>Segment mix</strong>
              {fundamentals.segmentMix.length ? (
                <div className="bar-list">
                  {fundamentals.segmentMix.map((item) => (
                    <div key={item.label} className="bar-row">
                      <div className="status-chip">
                        <strong>{item.label}</strong>
                      </div>
                      <div className="bar-meter">
                        <div className="bar-fill" style={{ width: `${item.valuePct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Segment mix is not loaded yet.</p>
              )}
            </div>
            <div className="metric-card">
              <strong>Geography mix</strong>
              {fundamentals.geographyMix.length ? (
                <div className="bar-list">
                  {fundamentals.geographyMix.map((item) => (
                    <div key={item.label} className="bar-row">
                      <div className="status-chip">
                        <strong>{item.label}</strong>
                      </div>
                      <div className="bar-meter">
                        <div className="bar-fill" style={{ width: `${item.valuePct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Geography mix is not loaded yet.</p>
              )}
            </div>
            {ai ? <AiExplanationCard explanation={ai.fundamentals} title="Fundamentals interpretation" /> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Charts and Technicals" eyebrow="Stage 3">
        <div id="charts" className="two-column">
          <div className="stack-list">
            <div className="metric-card">
              <strong>Coverage status</strong>
              <p className="muted">
                {technicals.liveStatus === "live"
                  ? "Price history, indicators, trend summary, and levels are live from stored EOD data."
                  : technicals.liveStatus === "partial"
                    ? "Technical coverage is partially loaded. Some derived analytics are still missing."
                    : "No live technical data is loaded yet. Run the EOD market-data loader to populate this tab."}
              </p>
            </div>
            <TrustPanel
              title="Technicals trust note"
              freshness={technicalsFreshness.label}
              sourceLabel="Persisted EOD prices, indicators, derived price levels, and trend events"
              learn="Use trend state and levels together; one signal alone is rarely enough."
              caution="This is end-of-day structure, not intraday execution advice."
            />
            <Sparkline prices={technicals.prices} />
          </div>
          <div className="stack-list">
            {technicals.indicators.length ? (
              technicals.indicators.map((indicator) => (
                <div key={indicator.name} className="metric-card">
                  <strong>{indicator.name}</strong>
                  <p>{indicator.value}</p>
                  <p className={indicator.tone === "positive" ? "positive" : "muted"}>{indicator.interpretation}</p>
                </div>
              ))
            ) : (
              <div className="metric-card">
                <strong>No indicators stored yet</strong>
                <p className="muted">Moving averages, RSI, MACD, and ATR will appear after indicator computation runs.</p>
              </div>
            )}
          </div>
        </div>
        <div className="two-column">
          <div className="stack-list">
            {technicals.supportResistance.length ? (
              technicals.supportResistance.map((level) => (
                <div key={level.label} className="metric-card">
                  <strong>
                    {level.label}: {level.value}
                  </strong>
                  <p className="muted">{level.reason}</p>
                </div>
              ))
            ) : (
              <div className="metric-card">
                <strong>No price levels stored yet</strong>
                <p className="muted">Support and resistance levels will show up after derived technical analytics are written.</p>
              </div>
            )}
          </div>
          <div className="stack-list">
            {technicals.events.length ? (
              technicals.events.map((event) => (
                <div key={event} className="metric-card">
                  {event}
                </div>
              ))
            ) : (
              <div className="metric-card">
                <strong>No technical events stored yet</strong>
                <p className="muted">Trend events and signal notes will appear after the analytics worker writes them.</p>
              </div>
            )}
          </div>
        </div>
        {ai ? <AiExplanationCard explanation={ai.technicals} title="Technical interpretation" /> : null}
      </SectionCard>

      <SectionCard title="News and Events" eyebrow="Stage 4">
        <div id="news" className="two-column">
          <div className="stack-list">
            <div className="metric-card">
              <strong>Coverage status</strong>
              <p className="muted">
                {news.length && bundle.events.length
                  ? "News links and event rows are live from stored source records."
                  : news.length || bundle.events.length
                    ? "News and event coverage is partially loaded for this company."
                    : "No grounded news or event rows are stored yet for this company."}
              </p>
            </div>
            <TrustPanel
              title="News trust note"
              freshness="Articles appear when linked source records are persisted for the symbol."
              sourceLabel="Stored article records, entity tags, and company-linked event rows"
              learn="Use impact notes to understand why the market may care, not as a prediction of what it will do."
              caution="Sparse news coverage often means linking or source capture is still incomplete."
            />
            <div className="news-list">
              {news.length ? (
                news.map((article) => (
                  <article key={article.id} className="news-card">
                    <span className="eyebrow">{article.source}</span>
                    <strong>{article.headline}</strong>
                    {article.summary ? <p className="muted">{article.summary}</p> : null}
                    <p>{article.whyItMatters}</p>
                    <p className="muted">
                      {article.publishedAt} | Impact {article.impactScore} | {article.sentiment}
                    </p>
                    {article.entities?.length ? (
                      <div className="stock-meta">
                        {article.entities.slice(0, 5).map((entity) => (
                          <span key={`${article.id}-${entity.entityType}-${entity.entityName}`} className="tag">
                            {entity.entityName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {article.sourceUrl ? (
                      <p className="muted">
                        <a href={article.sourceUrl} target="_blank" rel="noreferrer">
                          Source link
                        </a>
                      </p>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="metric-card">
                  <strong>No company-linked news stored yet</strong>
                  <p className="muted">Articles will appear here once the ingestion layer writes linked source records.</p>
                </div>
              )}
            </div>
          </div>
          <div className="event-list">
            {bundle.events.length ? (
              bundle.events.map((event) => (
                <div key={event.id} className="metric-card">
                  <strong>{event.title}</strong>
                  <p>{event.eventDate}</p>
                  <p className="muted">{event.note}</p>
                </div>
              ))
            ) : (
              <div className="metric-card">
                <strong>No upcoming events stored yet</strong>
                <p className="muted">Earnings, filing, and company-event rows will appear here once they are persisted.</p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Behavior and Market Context" eyebrow="Stage 5">
        <div id="behavior" className="two-column">
          <div className="stack-list">
            <div className="metric-card">
              <strong>Coverage status</strong>
              <p className="muted">
                {behavior.liveStatus === "live"
                  ? "Behavior scores and market-context framing are live from stored analytics snapshots."
                  : behavior.liveStatus === "partial"
                    ? "Some behavior analytics are live, but this company still needs fuller market-context coverage."
                    : "No live behavior analytics are loaded yet. Run the analytics refresh to populate this tab."}
              </p>
            </div>
            <TrustPanel
              title="Behavior trust note"
              freshness={behaviorFreshness.label}
              sourceLabel="Persisted behavior analytics, benchmark-relative context, and macro-regime labels"
              learn="Behavior explains how the stock tends to move, not whether it must move next."
              caution="A partial behavior state means the score layer exists but broader market context is still thin."
            />
            <div className="metric-card">
              <strong>Current regime</strong>
              <p>{behavior.regimeLabel}</p>
              <p className="muted">{behavior.macroRegime}</p>
              <p className="muted">{behavior.narrative}</p>
            </div>
            <div className="metric-card">
              <strong>Market context</strong>
              <p className="muted">{behavior.marketContextSummary}</p>
              {behavior.benchmarkSymbol ? (
                <div className="stock-meta">
                  <span>{behavior.benchmarkSymbol}</span>
                  {behavior.benchmarkReturnPct !== undefined ? (
                    <span>{formatSignedPct(behavior.benchmarkReturnPct)}</span>
                  ) : null}
                  {behavior.relativeStrengthPct !== undefined ? (
                    <span>Rel strength {formatSignedPct(behavior.relativeStrengthPct)}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="metric-card">
              <strong>Context signals</strong>
              {behavior.contextSignals.length ? (
                <div className="stack-list">
                  {behavior.contextSignals.map((signal) => (
                    <p key={signal} className="muted">
                      {signal}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="muted">Market-context signals will appear here once the analytics worker writes a behavior snapshot.</p>
              )}
            </div>
          </div>
          <div className="metric-grid">
            {behavior.scores.length ? (
              behavior.scores.map((score) => (
                <div key={score.label} className="metric-card">
                  <span className="muted">{score.label}</span>
                  <strong>{score.value}/100</strong>
                  <p>{score.interpretation}</p>
                </div>
              ))
            ) : (
              <div className="metric-card">
                <strong>No behavior scores stored yet</strong>
                <p className="muted">Momentum, acceleration, trend-decay, volatility, and market-linkage scores will appear after analytics runs.</p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Peers" eyebrow="Stage 2">
        <div className="stack-list">
          <TrustPanel
            title="Peers trust note"
            freshness={fundamentalsFreshness.label}
            sourceLabel="Persisted peer grouping and stored valuation / return metrics"
            learn="Peers are best used for relative framing, not as direct substitutes for business quality."
            caution="If peers are missing, the company may not yet have a linked peer group."
          />
          <div id="peers" className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Company</th>
                  <th>PE</th>
                  <th>ROE</th>
                  <th>Revenue Growth</th>
                  <th>1Y Return</th>
                </tr>
              </thead>
              <tbody>
                {fundamentals.peerComparison.length ? (
                  fundamentals.peerComparison.map((peer) => (
                    <tr key={peer.symbol}>
                      <td>{peer.symbol}</td>
                      <td>{peer.companyName}</td>
                      <td>{peer.pe}</td>
                      <td>{peer.roe}%</td>
                      <td>{peer.revenueGrowthPct}%</td>
                      <td>{peer.oneYearReturnPct}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">
                      No peer-group comparison is stored yet for this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Strategies and Scenarios" eyebrow="Stage 6">
        <div className="stack-list">
          <div className="metric-card">
            <strong>Coverage status</strong>
            <p className="muted">
              {strategies.length && scenarios.length
                ? "Strategy evaluations and scenario outputs are live from persisted analytics."
                : strategies.length || scenarios.length
                  ? "Strategy coverage is partially loaded. Some persisted evaluations or scenario outputs are still missing."
                  : "No live strategy evaluations or scenario outputs are stored yet. Run the analytics refresh to populate this tab."}
            </p>
          </div>
          <TrustPanel
            title="Strategies trust note"
            freshness={strategyFreshness.label}
            sourceLabel="Deterministic rules, persisted support points, stored scenario generation, and invalidation levels"
            learn="Treat these as structured research frames and watchlists, not direct buy or sell instructions."
            caution="Higher confidence means stronger internal rule alignment, not certainty about future price action."
          />
        </div>
        <div id="strategies" className="strategy-grid">
          {strategies.length ? (
            strategies.map((strategy) => (
              <div key={strategy.id} className="strategy-card" data-matched={String(strategy.matched)}>
                <span className="eyebrow">{strategy.matched ? "Matched" : "Watch only"}</span>
                <strong>{strategy.strategyName}</strong>
                <p>{strategy.explanation}</p>
                <p className="muted">Confidence {strategy.confidencePct}%</p>
                {strategy.category ? <p className="muted">Category: {strategy.category}</p> : null}
                {strategy.matchedRuleCount !== undefined && strategy.totalRuleCount !== undefined ? (
                  <p className="muted">
                    Rule coverage: {strategy.matchedRuleCount}/{strategy.totalRuleCount}
                    {strategy.supportQuality ? ` | ${strategy.supportQuality}` : ""}
                  </p>
                ) : null}
                {strategy.sourceSnapshotDate ? <p className="muted">Snapshot: {strategy.sourceSnapshotDate}</p> : null}
                <p className="muted">Invalidation: {strategy.invalidation}</p>
                {strategy.provenanceNote ? <p className="muted">{strategy.provenanceNote}</p> : null}
              </div>
            ))
          ) : (
            <div className="metric-card">
              <strong>No strategy evaluations stored yet</strong>
              <p className="muted">Deterministic strategy matches will appear here once the analytics layer writes persisted evaluations.</p>
            </div>
          )}
        </div>
        <div className="scenario-grid">
          {scenarios.length ? (
            scenarios.map((scenario) => (
              <div key={scenario.id} className="scenario-card">
                <span className="eyebrow">{scenario.stance}</span>
                <strong>{scenario.title}</strong>
                <p>{scenario.explanation}</p>
                {scenario.sourceSnapshotDate ? <p className="muted">Snapshot: {scenario.sourceSnapshotDate}</p> : null}
                <p className="muted">Trigger: {scenario.trigger}</p>
                <p className="muted">Invalidation: {scenario.invalidation}</p>
                {scenario.provenanceNote ? <p className="muted">{scenario.provenanceNote}</p> : null}
              </div>
            ))
          ) : (
            <div className="metric-card">
              <strong>No scenario outputs stored yet</strong>
              <p className="muted">Bullish, neutral, and bearish paths will appear here once persisted scenario generation runs.</p>
            </div>
          )}
        </div>
        {ai ? <AiExplanationCard explanation={ai.strategies} title="Strategies and scenarios interpretation" /> : null}
      </SectionCard>
    </div>
  );
}
