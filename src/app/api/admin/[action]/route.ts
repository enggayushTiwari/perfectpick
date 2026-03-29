import { NextResponse } from "next/server";
import { getAdminOverview, getDataQualityIssues, getIngestionJobs, getSourceRuns, getSourceStatuses } from "@/lib/repositories";

type RouteContext = {
  params: Promise<{
    action: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { action } = await context.params;

  switch (action) {
    case "ingestion":
    case "ingestion-status":
      return NextResponse.json({ jobs: await getIngestionJobs() });
    case "overview":
    case "health":
      return NextResponse.json({ overview: await getAdminOverview() });
    case "data-quality":
      return NextResponse.json({ issues: await getDataQualityIssues() });
    case "source-runs":
      return NextResponse.json({ runs: await getSourceRuns() });
    case "model-runs":
      return NextResponse.json({ sources: await getSourceStatuses() });
    default:
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function POST(_: Request, context: RouteContext) {
  const { action } = await context.params;

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
