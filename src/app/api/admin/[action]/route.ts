import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import {
  getAdminOverview,
  getDataQualityIssues,
  getFilingDocuments,
  getIngestionJobs,
  getSourceRuns,
  getSourceStatuses,
  getStaleSymbols
} from "@/lib/repositories";

const execFileAsync = promisify(execFile);

type RouteContext = {
  params: Promise<{
    action: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { action } = await context.params;
  const repoRoot = process.cwd();
  const installScriptPath = `${repoRoot}\\scripts\\install-filing-queue-task.ps1`;
  const runnerScriptPath = `${repoRoot}\\scripts\\run-filing-queue.ps1`;

  switch (action) {
    case "ingestion":
    case "ingestion-status":
      return NextResponse.json({ jobs: await getIngestionJobs() });
    case "overview":
    case "health":
      return NextResponse.json({ overview: await getAdminOverview() });
    case "data-quality":
      return NextResponse.json({ issues: await getDataQualityIssues() });
    case "stale-symbols":
    case "freshness":
      return NextResponse.json({ symbols: await getStaleSymbols() });
    case "source-runs":
      return NextResponse.json({ runs: await getSourceRuns() });
    case "filing-documents":
    case "documents":
      return NextResponse.json({ documents: await getFilingDocuments() });
    case "scheduler":
    case "task-scheduler":
      return NextResponse.json({
        taskName: "PerfectPick Filing Queue",
        installScriptPath,
        runnerScriptPath,
        recommendedInstallCommand: `powershell.exe -ExecutionPolicy Bypass -File "${installScriptPath}" -Mode Drain -FrequencyMinutes 5`,
        recommendedWorkerInstallCommand: `powershell.exe -ExecutionPolicy Bypass -File "${installScriptPath}" -Mode Worker`
      });
    case "model-runs":
      return NextResponse.json({ sources: await getSourceStatuses() });
    default:
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function POST(_: Request, context: RouteContext) {
  const { action } = await context.params;

  if (action === "scheduler" || action === "task-scheduler") {
    let body: { mode?: "Drain" | "Worker" } = {};
    try {
      body = (await _.json()) as { mode?: "Drain" | "Worker" };
    } catch {
      body = {};
    }

    const installScriptPath = `${process.cwd()}\\scripts\\install-filing-queue-task.ps1`;
    const mode = body.mode === "Worker" ? "Worker" : "Drain";

    try {
      const { stdout, stderr } = await execFileAsync("powershell.exe", [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        installScriptPath,
        "-Mode",
        mode
      ]);

      return NextResponse.json({
        installed: true,
        mode,
        message: `${mode} scheduler installed.`,
        output: stdout?.trim() || stderr?.trim() || null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduler installation failed.";
      return NextResponse.json({ installed: false, error: message }, { status: 500 });
    }
  }

  if (action !== "ingestion" && action !== "run") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      queued: true,
      message: "Demo ingestion request accepted. Wire this route to a worker trigger in production."
    },
    { status: 202 }
  );
}
