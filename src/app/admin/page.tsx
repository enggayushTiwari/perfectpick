import { SchedulerControls } from "@/components/scheduler-controls";
import { SectionCard } from "@/components/section-card";
import {
  getAdminOverview,
  getDataQualityIssues,
  getFilingDocuments,
  getIngestionJobs,
  getStaleSymbols,
  getSourceRuns,
  getSourceStatuses
} from "@/lib/repositories";

export default async function AdminPage() {
  const [overview, sources, jobs, runs, issues, staleSymbols, documents] = await Promise.all([
    getAdminOverview(),
    getSourceStatuses(),
    getIngestionJobs(),
    getSourceRuns(),
    getDataQualityIssues(),
    getStaleSymbols(),
    getFilingDocuments()
  ]);
  const installScriptPath = `${process.cwd()}\\scripts\\install-filing-queue-task.ps1`;
  const drainCommand = `powershell.exe -ExecutionPolicy Bypass -File "${installScriptPath}" -Mode Drain -FrequencyMinutes 5`;
  const workerCommand = `powershell.exe -ExecutionPolicy Bypass -File "${installScriptPath}" -Mode Worker`;

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
          <div className="metric-card">
            <span className="muted">Stale symbols</span>
            <strong>{staleSymbols.length}</strong>
            <p className="muted">Primary listings currently missing or outside the freshness window.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Scheduler controls" eyebrow="Automation">
        <SchedulerControls
          installScriptPath={installScriptPath}
          drainCommand={drainCommand}
          workerCommand={workerCommand}
        />
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

      <SectionCard title="Stale symbols" eyebrow="Freshness audit">
        <div className="stack-list">
          {staleSymbols.length ? (
            staleSymbols.map((item) => (
              <div key={`${item.exchange}:${item.symbol}`} className="metric-card">
                <strong>
                  {item.exchange}:{item.symbol} {"-"} {item.companyName}
                </strong>
                <p>
                  {item.status}
                  {typeof item.snapshotAgeDays === "number" ? ` | ${item.snapshotAgeDays} days old` : " | no snapshot yet"}
                </p>
                <p className="muted">{item.note}</p>
              </div>
            ))
          ) : (
            <div className="metric-card">No stale primary symbols are currently detected.</div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Filing intake queue" eyebrow="Document processing">
        <div className="stack-list">
          {documents.length ? (
            documents.map((document) => (
              <div key={document.id} className="metric-card">
                <strong>
                  {document.symbol} {"-"} {document.documentKind}
                </strong>
                <p>
                  {document.status} | {document.sourceType}
                </p>
                <p className="muted">
                  Queued {document.queuedAt.slice(0, 16)}
                  {document.processingFinishedAt ? ` | Finished ${document.processingFinishedAt.slice(0, 16)}` : ""}
                </p>
                {document.inputPath ? <p className="muted">PDF/input: {document.inputPath}</p> : null}
                {document.ocrPath ? <p className="muted">OCR sidecar: {document.ocrPath}</p> : null}
                {document.normalizedOutputPath ? (
                  <p className="muted">Normalized output: {document.normalizedOutputPath}</p>
                ) : null}
                {document.errorMessage ? <p className="caution">{document.errorMessage}</p> : null}
              </div>
            ))
          ) : (
            <div className="metric-card">No filing documents are currently queued.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
