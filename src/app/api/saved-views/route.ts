import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ mode: "demo", results: [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ mode: "demo", accepted: body }, { status: 202 });
}

