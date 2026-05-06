import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, scannerUniverse } from "@/db";
import { generateTickerAiResult, profileToColumns } from "@/lib/ticker-ai";
import { logger } from "@/lib/logger";

// POST /api/tickers/:ticker/redraft
//
// Calls Gemini to re-generate the qualitative profile for a single ticker
// and writes the result to scanner_universe. Does not touch tags / themes /
// description — those are managed via the EditTickerModal — only the profile
// columns + profileGeneratedAt timestamp.
//
// Returns the new profile so the caller can update its UI optimistically.
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
        sector: scannerUniverse.sector,
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
      sector: row.sector,
      market: row.market,
    });

    const cols = profileToColumns(result.profile);
    await db
      .update(scannerUniverse)
      .set({
        ...cols,
        profileGeneratedAt: sql`datetime('now')`,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(scannerUniverse.ticker, ticker));

    revalidatePath(`/markets/ticker/${ticker}`);

    logger.info("api/tickers/[ticker]/redraft", "Profile re-drafted", {
      ticker,
    });

    return NextResponse.json({
      ticker,
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
