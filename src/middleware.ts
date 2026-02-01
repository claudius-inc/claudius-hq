import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes: check API key
  if (pathname.startsWith("/api/")) {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
    if (apiKey !== process.env.HQ_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (session?.value !== "authenticated") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
