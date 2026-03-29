import { SectionCard } from "@/components/section-card";
import {
  getAdminOverview,
  getDataQualityIssues,
  getIngestionJobs,
  getSourceRuns,
  getSourceStatuses
} from "@/lib/repositories";

export default async function AdminPage() {
  const [overview, sources, jobs, runs, issues] = await Promise.all([
    getAdminOverview(),
    getSourceStatuses(),
    getIngestionJobs(),
    getSourceRuns(),
    getDataQualityIssues()
  ]);

  return (
    <div className="page-stack">
      <section className="stock-hero">
        <span className="eyebrow">Phase 0 platform spine</span>
        <h1>Ingestion, source health, and data quality monitoring.</h1>
        <p className="section-copy">
          This page now reflects the platform backbone: source freshness, recent runs, open data issues,
          and ingestion throughput before higher-order product features are layered on top.
        </p>
      </section>

      <SectionCard title="Platform health" eyebrow="Overview">
        <div className="metric-grid">
          <div className="metric-card">
            <span className="muted">Sources</span>
            <strong>{overview.totalSources}</strong>
            <p className="muted">
              {overview.healthySources} healthy, {overview.staleSources} stale
            </p>
          </div>
          <div className="metric-card">
            <span className="muted">Job backlog</span>
            <strong>{overview.runningJobs + overview.queuedJobs}</strong>
            <p className="muted">
              {overview.runningJobs} running, {overview.queuedJobs} queued
            </p>
          </div>
          <div className="metric-card">
            <span className="muted">Warnings</span>
            <strong>{overview.warningJobs + overview.warningSources + overview.degradedSources}</strong>
            <p className="muted">
              {overview.warningJobs} job warnings, {overview.degradedSources} degraded sources
            </p>
          </div>
          <div className="metric-card">
            <span className="muted">Open issues</span>
            <strong>{overview.openIssues}</strong>
            <p className="muted">
              {overview.resolvedIssues} resolved, latest activity {overview.latestActivityAt?.slice(0, 16) ?? "n/a"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Source adapters" eyebrow="Freshness">
        <div className="source-grid">
          {sources.map((source) => (
            <div key={source.adapter} className="status-card">
              <div className={`status-chip ${source.status === "warning" || source.status === "stale" ? "warning" : ""}`}>
                <strong>{source.adapter}</strong>
              </div>
              <p>{source.status}</p>
              <p>{source.freshness}</p>
              <p className="muted">{source.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent jobs" eyebrow="Batch monitoring">
        <div className="stack-list">
          {jobs.map((job) => (
            <div key={job.id} className="metric-card">
              <strong>
                {job.source} {"->"} {job.target}
              </strong>
              <p>{job.status}</p>
              <p className="muted">{job.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="two-column">
        <SectionCard title="Recent source runs" eyebrow="Replay trail">
          <div className="stack-list">
            {runs.length ? (
              runs.map((run) => (
                <div key={run.id} className="metric-card">
                  <strong>{run.adapter}</strong>
                  <p>
                    {run.status} | {run.startedAt.slice(0, 16)}
                  </p>
                  <p className="muted">{run.detail}</p>
                </div>
              ))
            ) : (
              <div className="metric-card">No source runs recorded yet.</div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Data quality issues" eyebrow="Trust layer">
          <div className="stack-list">
            {issues.length ? (
              issues.map((issue) => (
                <div key={issue.id} className="metric-card">
                  <strong>{issue.adapter}</strong>
                  <p>{issue.issueType}</p>
                  <p className="muted">{issue.detail}</p>
                </div>
              ))
            ) : (
              <div className="metric-card">No data quality issues are currently recorded.</div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
