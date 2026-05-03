import { NextResponse } from "next/server";
import { computeWatchlistScores } from "@/lib/scanner/watchlist-orchestrator";
import { isAuthenticated } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Browser-callable proxy for the watchlist refresh.
 * Requires an authenticated app session (cookie-based, see lib/auth.ts).
 * Calls computeWatchlistScores in-process — does not require the HQ_API_KEY
 * bearer that the GH-Action-facing /refresh endpoint takes.
 */
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await computeWatchlistScores();
    if (result.allFailed) {
      return NextResponse.json(
        { success: false, error: "all_failed", ...result },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("watchlist-refresh-proxy", "Run crashed", { error: err });
    return NextResponse.json(
      { success: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
