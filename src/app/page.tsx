import Link from "next/link";
import { SearchPanel } from "@/components/search-panel";
import { SectionCard } from "@/components/section-card";
import { formatSignedPct } from "@/lib/format";
import {
  getFeaturedPatterns,
  getIngestionJobs,
  getMarketSummary,
  getScreeners,
  getSearchResults,
  getSourceStatuses,
  getUpcomingEvents
} from "@/lib/repositories";

export default async function HomePage() {
  const [companies, summary, screeners, sources, jobs, patterns, events] = await Promise.all([
    getSearchResults(),
    getMarketSummary(),
    getScreeners(),
    getSourceStatuses(),
    getIngestionJobs(),
    getFeaturedPatterns(),
    getUpcomingEvents()
  ]);

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-panel hero-copy">
          <span className="eyebrow">Stage 1 to Stage 7</span>
          <h1>Search-first stock reading for Indian markets.</h1>
          <p>
            PerfectPick turns end-of-day market data, filings, news, and structured strategy logic into one
            responsive web experience. The current starter reads live Supabase public views where data has
            been loaded, while leaving a narrow fallback path for tabs that still need deeper ingestion.
          </p>
          <div className="pill-row">
            <div className="pill">
              <strong>{summary.lastUpdated}</strong>
              <span>Last EOD snapshot</span>
            </div>
            <div className="pill">
              <strong>{screeners.length}</strong>
              <span>Matched screener outputs</span>
            </div>
            <div className="pill">
              <strong>{events.length}</strong>
              <span>Upcoming company events</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <SearchPanel companies={companies} />
        </div>
      </section>

      <section className="summary-strip">
        <div>
          <span className="eyebrow">Market context</span>
          <h2>{summary.headline}</h2>
          <p className="muted">{summary.breadth}</p>
        </div>
        <div className="overview-fact">
          <strong>Leadership</strong>
          <p className="muted">{summary.leaders.join(", ")}</p>
        </div>
        <div className="overview-fact">
          <strong>Risk framing</strong>
          <p className="muted">{summary.caution}</p>
        </div>
        <div className="overview-fact">
          <strong>Operating model</strong>
          <p className="muted">Batch processing, cached pages, and EOD snapshots.</p>
        </div>
      </section>

      <div className="two-column">
        <SectionCard title="Strategy Screeners" eyebrow="Stage 6">
          <div className="strategy-grid">
            {screeners.slice(0, 6).map((item) => (
              <Link href={`/stocks/${item.symbol}`} key={`${item.symbol}-${item.strategyName}`} className="strategy-card" data-matched="true">
                <span className="eyebrow">{item.strategyName}</span>
                <strong>{item.symbol}</strong>
                <p className="muted">{item.companyName}</p>
                <p>{item.explanation}</p>
                <span className="positive">{formatSignedPct(item.confidencePct - 50, 0)} over neutral confidence</span>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Source Health" eyebrow="Stage 0">
          <div className="source-grid">
            {sources.map((source) => (
              <div key={source.adapter} className="status-card">
                <div className={`status-chip ${source.status === "warning" ? "warning" : ""}`}>
                  <strong>{source.adapter}</strong>
                </div>
                <p>{source.freshness}</p>
                <p className="muted">{source.note}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="two-column">
        <SectionCard title="Build Stages" eyebrow="Roadmap">
          <div className="stack-list">
            {[
              "Stage 0: Supabase schemas, auth, storage buckets, and ingestion control tables.",
              "Stage 1-2: Search, overview, fundamentals, business model context, and peer comparison.",
              "Stage 3-5: Charts, technicals, news impact, behavior scoring, and market context.",
              "Stage 6-7: Strategies, scenarios, pattern matching, and learning overlays."
            ].map((line) => (
              <div key={line} className="metric-card">
                {line}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Admin Snapshot" eyebrow="Monitoring">
          <div className="stack-list">
            {jobs.map((job) => (
              <div key={job.id} className="metric-card">
                <strong>{job.source}</strong>
                <p>{job.target}</p>
                <p className="muted">{job.note}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="two-column">
        <SectionCard title="Pattern Highlights" eyebrow="Intelligence">
          <div className="stack-list">
            {patterns.map((pattern) => (
              <div key={pattern.id} className="metric-card">
                <strong>{pattern.patternName}</strong>
                <p>{pattern.note}</p>
                <p className="muted">Similar cases: {pattern.similarCases.join(", ")}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Upcoming Events" eyebrow="Catalysts">
          <div className="stack-list">
            {events.slice(0, 4).map((event) => (
              <div key={event.id} className="metric-card">
                <strong>{event.title}</strong>
                <p>{event.eventDate}</p>
                <p className="muted">{event.note}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
