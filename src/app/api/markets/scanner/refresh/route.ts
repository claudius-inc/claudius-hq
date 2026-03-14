import { NextRequest, NextResponse } from "next/server";
import { runScannerRefresh, getScannerState } from "@/lib/scanner";

/**
 * GET /api/markets/scanner/refresh
 * Vercel Cron endpoint - triggers scanner refresh.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // In production, require the cron secret
    if (process.env.NODE_ENV === "production") {
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.log("[Cron] Starting scanner refresh...");

    const result = await runScannerRefresh();

    if (!result.success) {
      console.error("[Cron] Scanner refresh failed:", result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    console.log(`[Cron] Scanner refresh complete. Enhanced ${result.enhancedCount} stocks.`);

    return NextResponse.json({
      success: true,
      enhancedCount: result.enhancedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[Cron] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/markets/scanner/refresh
 * Manual trigger for scanner refresh.
 * Can be called from admin panel.
 */
export async function POST(req: NextRequest) {
  try {
    // Check API key
    const apiKey = req.headers.get("x-api-key");
    const isAuthorized =
      apiKey === process.env.HQ_API_KEY ||
      process.env.NODE_ENV === "development";

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = await getScannerState();
    if (state.isRefreshing) {
      return NextResponse.json(
        { error: "Refresh already in progress" },
        { status: 409 }
      );
    }

    const result = await runScannerRefresh();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      enhancedCount: result.enhancedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[Refresh API] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
