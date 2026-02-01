import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  if (password !== process.env.HQ_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const cookie = getSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie);
  return response;
}
