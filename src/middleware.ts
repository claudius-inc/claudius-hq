import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const SESSION_VALUE = process.env.HQ_SESSION_SECRET;

if (!SESSION_VALUE) {
  throw new Error("HQ_SESSION_SECRET environment variable is required");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // External webhooks only - these services can't pass our auth
  // Telegram webhook: Telegram servers call this
  if (pathname.startsWith("/api/telegram/")) {
    return NextResponse.next();
  }

  // Email webhook: Cloudflare Email Worker forwards here
  if (pathname === "/api/integrations/email" && request.method === "POST") {
    return NextResponse.next();
  }

  // ACP endpoints: public APIs for agent-to-agent commerce
  // These are consumed by external agents on Virtuals.io ACP
  if (pathname.startsWith("/api/acp/")) {
    return NextResponse.next();
  }

  // Cron endpoints: triggered by GitHub Actions (Vercel Hobby caps cron at
  // daily). The routes themselves enforce auth via x-vercel-cron header or
  // Bearer ${CRON_SECRET}; passing them through middleware avoids a
  // double-auth requirement that would force GH Actions to also know
  // HQ_API_KEY.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Health endpoint: public for monitoring/uptime checks
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // All other APIs require auth

  // API routes: check API key OR session cookie
  if (pathname.startsWith("/api/")) {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
    const session = request.cookies.get("hq_session");
    if (apiKey !== process.env.HQ_API_KEY && session?.value !== SESSION_VALUE) {
      logger.warn("middleware", "Unauthorized API request", { path: pathname, ip: request.headers.get("x-forwarded-for")?.split(",")[0] });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF protection: verify origin for state-changing requests
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin && host && !origin.includes(host)) {
        if (apiKey !== process.env.HQ_API_KEY) {
          logger.warn("middleware", "CSRF validation failed", { path: pathname, origin });
          return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
        }
      }
    }

    return NextResponse.next();
  }

  // Login page: always accessible
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Auth action: always accessible
  if (pathname === "/auth") {
    return NextResponse.next();
  }

  // All other pages: check session cookie
  const session = request.cookies.get("hq_session");
  if (session?.value !== SESSION_VALUE) {
    const loginUrl = new URL("/login", request.url);
    // Preserve where the user was trying to go so we can send them back
    // post-login. Skip for trivial cases (root, login itself).
    if (pathname !== "/" && pathname !== "/login") {
      loginUrl.searchParams.set("from", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.png$|.*\\.ico$|.*\\.svg$).*)"],
};
