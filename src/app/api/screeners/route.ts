import { NextResponse } from "next/server";
import { getScreeners } from "@/lib/repositories";

export async function GET() {
  return NextResponse.json({ results: await getScreeners() });
}

