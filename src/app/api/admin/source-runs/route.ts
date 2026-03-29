import { NextResponse } from "next/server";
import { getSourceRuns } from "@/lib/repositories";

export async function GET() {
  return NextResponse.json({ runs: await getSourceRuns() });
}
