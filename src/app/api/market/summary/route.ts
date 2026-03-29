import { NextResponse } from "next/server";
import { getMarketSummary } from "@/lib/repositories";

export async function GET() {
  return NextResponse.json(await getMarketSummary());
}

