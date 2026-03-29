import { NextResponse } from "next/server";
import { getFilingDocuments, getIngestionJobs } from "@/lib/repositories";

export async function GET() {
  const [jobs, documents] = await Promise.all([getIngestionJobs(), getFilingDocuments()]);
  return NextResponse.json({ jobs, documents });
}
