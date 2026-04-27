/**
 * GET /api/cron/acp-revenue-sync
 *
 * Refreshes the on-chain revenue cache by hitting Blockscout for the agent's
 * V2 wallet. Without this, /api/acp/revenue returns whatever the last manual
 * trigger wrote.
 *
 * Schedule: every 6 hours (vercel.json).
 * Auth: x-vercel-cron header OR Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const baseUrl =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://claudiusinc.com";
  try {
    const res = await fetch(`${baseUrl}/api/acp/revenue`, { method: "POST", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error("acp-revenue-sync", `Sync failed (${res.status})`, { body: json });
      return NextResponse.json({ error: "sync failed", status: res.status, body: json }, { status: 502 });
    }
    logger.info("acp-revenue-sync", "Synced on-chain revenue", {
      durationMs: Date.now() - startedAt,
      ...json,
    });
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...json });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("acp-revenue-sync", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
