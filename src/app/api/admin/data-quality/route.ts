import { NextResponse } from "next/server";
import { getDataQualityIssues } from "@/lib/repositories";

export async function GET() {
  return NextResponse.json({ issues: await getDataQualityIssues() });
}
