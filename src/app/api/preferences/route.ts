import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    mode: "demo",
    beginnerMode: true,
    mobileDensity: "comfortable"
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ mode: "demo", accepted: body });
}
