import { NextRequest, NextResponse } from "next/server";
import { logRequest } from "@/lib/logger";

// Use env secret or fallback (should be set in production)
const SESSION_VALUE = process.env.HQ_SESSION_SECRET || "authenticated";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Telegram webhook: no auth (Telegram can't send API keys)
  if (pathname.startsWith("/api/telegram/")) {
    return NextResponse.next();
  }

  // API routes: check API key OR session cookie
  if (pathname.startsWith("/api/")) {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
    const session = request.cookies.get("hq_session");
    if (apiKey !== process.env.HQ_API_KEY && session?.value !== SESSION_VALUE) {
      logRequest(request, 401);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF protection: verify origin for state-changing requests
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin && host && !origin.includes(host)) {
        if (apiKey !== process.env.HQ_API_KEY) {
          logRequest(request, 403);
          return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
        }
      }
    }

    logRequest(request, 200);
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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
