import { NextResponse } from "next/server";
import { getIngestionJobs } from "@/lib/repositories";

export async function GET() {
  return NextResponse.json({ jobs: await getIngestionJobs() });
}

