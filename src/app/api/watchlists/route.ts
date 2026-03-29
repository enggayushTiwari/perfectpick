import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    mode: "demo",
    message: "Live watchlists are stored through Supabase auth and RLS. Demo mode uses local browser storage."
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(
    {
      mode: "demo",
      accepted: body,
      message: "Server-side persistence is enabled once Supabase auth and env vars are configured."
    },
    { status: 202 }
  );
}

