import { NextResponse } from "next/server";
import { getSearchResults } from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await getSearchResults(q);
  return NextResponse.json({ query: q, results });
}

