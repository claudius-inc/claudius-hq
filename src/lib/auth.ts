import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SESSION_COOKIE = "hq_session";
// Use env secret or fallback (should be set in production)
const SESSION_VALUE = process.env.HQ_SESSION_SECRET || "authenticated";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export function isApiAuthenticated(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
  return apiKey === process.env.HQ_API_KEY;
}

export function getSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: SESSION_VALUE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  };
}
