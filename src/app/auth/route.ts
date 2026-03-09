import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "@/lib/auth";
import { logger } from "@/lib/logger";

// In-memory rate limiter: max 5 attempts per IP per 15-minute window
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  record.count++;
  return record.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  if (isRateLimited(ip)) {
    logger.warn("auth", "Rate limited login attempt", { ip });
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { password } = body;

  if (password !== process.env.HQ_PASSWORD) {
    logger.warn("auth", "Failed login attempt", { ip });
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const cookie = getSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie);
  return response;
}
