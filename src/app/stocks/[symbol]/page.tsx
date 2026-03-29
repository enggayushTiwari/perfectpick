import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Sparkline } from "@/components/sparkline";
import { StockTabNav } from "@/components/stock-tab-nav";
import { WatchlistToggle } from "@/components/watchlist-toggle";
import { formatCurrencyCr, formatSignedPct } from "@/lib/format";
import { getStockBundle } from "@/lib/repositories";

type StockPageProps = {
  params: Promise<{ symbol: string }>;
};

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  const bundle = await getStockBundle(symbol);

  if (!bundle) {
    notFound();
  }

  const { overview, fundamentals, technicals, news, behavior, strategies, scenarios } = bundle;

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
      </section>

      <StockTabNav />

      <SectionCard title="Overview" eyebrow="Stage 1">
        <div id="overview" className="two-column">
          <div className="stack-list">
            <div className="metric-card">
              <strong>Plain-language summary</strong>
              <p>{fundamentals.headline}</p>
            </div>
            <div className="metric-card">
              <strong>Business notes</strong>
              <div className="stack-list">
                {fundamentals.filingNotes.map((note) => (
                  <p key={note} className="muted">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="metric-grid">
            {fundamentals.metricCards.map((metric) => (
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
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Fundamentals" eyebrow="Stage 2">
        <div id="fundamentals" className="two-column">
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
                {fundamentals.yearly.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period}</td>
                    <td>{row.revenueCr.toLocaleString("en-IN")}</td>
                    <td>{row.ebitdaMarginPct}%</td>
                    <td>{row.roePct}%</td>
                    <td>{row.rocePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="two-column">
            <div className="metric-card">
              <strong>Segment mix</strong>
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
            </div>
            <div className="metric-card">
              <strong>Geography mix</strong>
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
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Charts and Technicals" eyebrow="Stage 3">
        <div id="charts" className="two-column">
          <Sparkline prices={technicals.prices} />
          <div className="stack-list">
            {technicals.indicators.map((indicator) => (
              <div key={indicator.name} className="metric-card">
                <strong>{indicator.name}</strong>
                <p>{indicator.value}</p>
                <p className={indicator.tone === "positive" ? "positive" : "muted"}>{indicator.interpretation}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="two-column">
          <div className="stack-list">
            {technicals.supportResistance.map((level) => (
              <div key={level.label} className="metric-card">
                <strong>
                  {level.label}: {level.value}
                </strong>
                <p className="muted">{level.reason}</p>
              </div>
            ))}
          </div>
          <div className="stack-list">
            {technicals.events.map((event) => (
              <div key={event} className="metric-card">
                {event}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="News and Events" eyebrow="Stage 4">
        <div id="news" className="two-column">
          <div className="news-list">
            {news.map((article) => (
              <article key={article.id} className="news-card">
                <span className="eyebrow">{article.source}</span>
                <strong>{article.headline}</strong>
                <p>{article.whyItMatters}</p>
                <p className="muted">
                  {article.publishedAt} | Impact {article.impactScore} | {article.sentiment}
                </p>
              </article>
            ))}
          </div>
          <div className="event-list">
            {bundle.events.map((event) => (
              <div key={event.id} className="metric-card">
                <strong>{event.title}</strong>
                <p>{event.eventDate}</p>
                <p className="muted">{event.note}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Behavior and Market Context" eyebrow="Stage 5">
        <div id="behavior" className="metric-grid">
          {behavior.scores.map((score) => (
            <div key={score.label} className="metric-card">
              <span className="muted">{score.label}</span>
              <strong>{score.value}/100</strong>
              <p>{score.interpretation}</p>
            </div>
          ))}
        </div>
        <div className="metric-card">{behavior.narrative}</div>
      </SectionCard>

      <SectionCard title="Peers" eyebrow="Stage 2">
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
              {fundamentals.peerComparison.map((peer) => (
                <tr key={peer.symbol}>
                  <td>{peer.symbol}</td>
                  <td>{peer.companyName}</td>
                  <td>{peer.pe}</td>
                  <td>{peer.roe}%</td>
                  <td>{peer.revenueGrowthPct}%</td>
                  <td>{peer.oneYearReturnPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Strategies and Scenarios" eyebrow="Stage 6">
        <div id="strategies" className="strategy-grid">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="strategy-card" data-matched={String(strategy.matched)}>
              <span className="eyebrow">{strategy.matched ? "Matched" : "Watch only"}</span>
              <strong>{strategy.strategyName}</strong>
              <p>{strategy.explanation}</p>
              <p className="muted">Confidence {strategy.confidencePct}%</p>
              <p className="muted">Invalidation: {strategy.invalidation}</p>
            </div>
          ))}
        </div>
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="scenario-card">
              <span className="eyebrow">{scenario.stance}</span>
              <strong>{scenario.title}</strong>
              <p>{scenario.explanation}</p>
              <p className="muted">Trigger: {scenario.trigger}</p>
              <p className="muted">Invalidation: {scenario.invalidation}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
