import { NextResponse } from "next/server";
import { computeWatchlistScores } from "@/lib/scanner/watchlist-orchestrator";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const expected = process.env.HQ_API_KEY;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace("Bearer ", "");
  return token === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 },
    );
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
    logger.error("watchlist-refresh", "Run crashed", { error: err });
    return NextResponse.json(
      { success: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
