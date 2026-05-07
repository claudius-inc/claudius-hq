import { db } from "@/db";
import { scannerUniverse } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeTickerForMarket,
  normalizeMarketCode,
} from "@/lib/scanner/ticker-normalize";

// GET /api/scanner/universe - List all tickers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get("market");
    const enabled = searchParams.get("enabled");

    let query = db.select().from(scannerUniverse);

    // Build conditions
    const conditions = [];
    if (market) {
      conditions.push(eq(scannerUniverse.market, market));
    }
    if (enabled !== null) {
      conditions.push(eq(scannerUniverse.enabled, enabled === "true"));
    }

    const tickers =
      conditions.length > 0
        ? await query.where(and(...conditions))
        : await query;

    // Group by market for summary
    const summary = {
      total: tickers.length,
      enabled: tickers.filter((t) => t.enabled).length,
      byMarket: {
        US: tickers.filter((t) => t.market === "US").length,
        SGX: tickers.filter((t) => t.market === "SGX").length,
        HK: tickers.filter((t) => t.market === "HK").length,
        JP: tickers.filter((t) => t.market === "JP").length,
        CN: tickers.filter((t) => t.market === "CN").length,
        LSE: tickers.filter((t) => t.market === "LSE").length,
      },
    };

    return NextResponse.json({ tickers, summary });
  } catch (error) {
    console.error("Error fetching scanner universe:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickers" },
      { status: 500 }
    );
  }
}

// POST /api/scanner/universe - Add ticker(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Support single ticker or array
    const tickersToAdd = Array.isArray(body) ? body : [body];

    const results = [];
    for (const item of tickersToAdd) {
      const { ticker, market, name, sector, source, notes, currency } = item;

      if (!ticker || !market) {
        results.push({ ticker, error: "ticker and market required" });
        continue;
      }

      try {
        // Normalize ticker for Yahoo Finance format
        const normalizedTicker = normalizeTickerForMarket(ticker, market);
        // Normalize market code (CN -> CN, CHINA -> CN, etc.)
        const normalizedMarket = normalizeMarketCode(market);

        const normalizedCurrency =
          typeof currency === "string" && currency.trim() ? currency.trim() : null;

        await db
          .insert(scannerUniverse)
          .values({
            ticker: normalizedTicker,
            market: normalizedMarket,
            name,
            sector,
            currency: normalizedCurrency,
            source: source || "user",
            notes,
          })
          .onConflictDoUpdate({
            target: scannerUniverse.ticker,
            set: {
              name,
              sector,
              // Don't blank a previously-good currency on update.
              ...(normalizedCurrency ? { currency: normalizedCurrency } : {}),
              notes,
              updatedAt: sql`datetime('now')`,
            },
          });
        results.push({ 
          ticker: normalizedTicker, 
          market: normalizedMarket,
          original: ticker,
          success: true 
        });
      } catch (e: unknown) {
        results.push({ ticker, error: String(e) });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error adding tickers:", error);
    return NextResponse.json(
      { error: "Failed to add tickers" },
      { status: 500 }
    );
  }
}

// DELETE /api/scanner/universe - Remove ticker
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker");

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker parameter required" },
        { status: 400 }
      );
    }

    await db
      .delete(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker.toUpperCase()));

    return NextResponse.json({ success: true, deleted: ticker });
  } catch (error) {
    console.error("Error deleting ticker:", error);
    return NextResponse.json(
      { error: "Failed to delete ticker" },
      { status: 500 }
    );
  }
}

// PATCH /api/scanner/universe - Toggle enabled status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, enabled, name, sector, notes } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker required" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updatedAt: sql`datetime('now')`,
    };

    if (typeof enabled === "boolean") updates.enabled = enabled;
    if (name !== undefined) updates.name = name;
    if (sector !== undefined) updates.sector = sector;
    if (notes !== undefined) updates.notes = notes;

    await db
      .update(scannerUniverse)
      .set(updates)
      .where(eq(scannerUniverse.ticker, ticker.toUpperCase()));

    return NextResponse.json({ success: true, ticker, updates });
  } catch (error) {
    console.error("Error updating ticker:", error);
    return NextResponse.json(
      { error: "Failed to update ticker" },
      { status: 500 }
    );
  }
}
