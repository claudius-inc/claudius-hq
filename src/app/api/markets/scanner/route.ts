import { NextRequest, NextResponse } from "next/server";
import {
  getLatestScan,
  getScannerState,
  canRefresh,
  runScannerRefresh,
} from "@/lib/scanner";

/**
 * GET /api/markets/scanner
 * Returns cached scanner results + state info.
 */
export async function GET() {
  try {
    const [scan, state, refreshStatus] = await Promise.all([
      getLatestScan(),
      getScannerState(),
      canRefresh(),
    ]);

    if (!scan) {
      return NextResponse.json(
        { error: "No scan data available" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      results: scan.results,
      summary: scan.summary,
      scannedAt: scan.scannedAt,
      state: {
        lastRefreshAt: state.lastRefreshAt,
        isRefreshing: state.isRefreshing,
        canRefresh: refreshStatus.allowed,
        nextRefreshAt: refreshStatus.nextRefreshAt,
      },
    });
  } catch (e) {
    console.error("[Scanner API] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/markets/scanner
 * Triggers a scanner refresh (rate-limited to 1 per 15 min).
 */
export async function POST(req: NextRequest) {
  try {
    // Check authorization (optional API key)
    const apiKey = req.headers.get("x-api-key");
    const cronSecret = req.headers.get("authorization")?.replace("Bearer ", "");
    const isAuthorized =
      apiKey === process.env.HQ_API_KEY ||
      cronSecret === process.env.CRON_SECRET ||
      process.env.NODE_ENV === "development";

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if we can refresh
    const canRefreshResult = await canRefresh();
    if (!canRefreshResult.allowed) {
      return NextResponse.json(
        {
          error: canRefreshResult.reason,
          nextRefreshAt: canRefreshResult.nextRefreshAt,
        },
        { status: 429 }
      );
    }

    // Note: For Vercel hobby, we have 10s timeout.
    // We'll try to run synchronously, but for larger ticker lists,
    // consider using the /api/markets/scanner/refresh endpoint with background function.
    const result = await runScannerRefresh();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      enhancedCount: result.enhancedCount,
      message: "Scanner refresh complete",
    });
  } catch (e) {
    console.error("[Scanner API] POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
