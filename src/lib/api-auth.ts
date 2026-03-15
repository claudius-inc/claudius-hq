import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.HQ_API_KEY;

/**
 * Check if request has valid HQ API key
 */
export function checkApiAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

/**
 * Return 401 Unauthorized response
 */
export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
