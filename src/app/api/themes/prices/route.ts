import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { fetchThemePrices } from "@/lib/themes";

// GET /api/themes/prices?tickers=AAPL,MSFT,GOOG
// Fetches prices for given tickers (max 20 at a time to prevent timeout)
export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get("tickers");
    if (!tickersParam) {
      return NextResponse.json({ error: "tickers param required" }, { status: 400 });
    }

    const tickers = tickersParam.split(",").slice(0, 20);
    const data = await fetchThemePrices(tickers);

    return NextResponse.json(
      data,
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e) {
    logger.error("api/themes/prices", "Failed to get prices", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
