import { NextRequest } from "next/server";

export function logRequest(request: NextRequest, status: number, duration?: number) {
  const method = request.method;
  const path = request.nextUrl.pathname;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const timestamp = new Date().toISOString();

  console.log(JSON.stringify({
    timestamp,
    method,
    path,
    status,
    ip,
    duration,
    userAgent: request.headers.get("user-agent")?.substring(0, 100),
  }));
}
