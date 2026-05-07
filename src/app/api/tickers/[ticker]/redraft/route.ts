import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, scannerUniverse } from "@/db";
import { generateTickerAiResult } from "@/lib/ai/ticker-ai";
import { logger } from "@/lib/logger";

// POST /api/tickers/:ticker/redraft
//
// Generates a fresh AI proposal (description + tags + themes + qualitative
// profile) and returns it WITHOUT writing to the DB. Used by:
//   - EditTickerProfileModal — reads `profile`
//   - EditTickerModal       — reads `description` / `tags` / `themes`
//   - AddTickerModal         — reads everything when re-running on a typed ticker
// Persistence happens through PATCH /api/tickers/:ticker (or POST for add).
export async function POST(
  _request: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const ticker = decodeURIComponent(params.ticker).trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const row = await db
      .select({
        ticker: scannerUniverse.ticker,
        market: scannerUniverse.market,
        name: scannerUniverse.name,
      })
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!row) {
      return NextResponse.json(
        { error: `Ticker "${ticker}" not found` },
        { status: 404 },
      );
    }

    const result = await generateTickerAiResult({
      ticker: row.ticker,
      name: row.name,
      market: row.market,
    });

    logger.info("api/tickers/[ticker]/redraft", "AI proposal generated", {
      ticker,
      tagCount: result.tags.length,
      themeCount: result.themes.length,
    });

    return NextResponse.json({
      ticker,
      description: result.description,
      tags: result.tags,
      themes: result.themes,
      profile: result.profile,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "AI response could not be parsed") {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    logger.error("api/tickers/[ticker]/redraft", "Failed to redraft", {
      error: e,
      ticker,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
