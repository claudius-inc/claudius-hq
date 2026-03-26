import { db } from "@/db";
import { scannerUniverse } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * Normalize ticker to Yahoo Finance format based on market
 * - China: auto-detect Shanghai (.SS) vs Shenzhen (.SZ) based on code prefix
 * - HK: add .HK suffix
 * - JP: add .T suffix
 * - SGX: add .SI suffix
 * - US: no suffix needed
 */
/**
 * Normalize market code to standard format
 */
function normalizeMarketCode(market: string): string {
  const upper = market.toUpperCase().trim();
  switch (upper) {
    case 'CHINA':
    case 'CN':
    case 'SSE':
    case 'SZSE':
      return 'CN';
    case 'HONG KONG':
    case 'HONGKONG':
    case 'HKEX':
    case 'HK':
      return 'HK';
    case 'JAPAN':
    case 'TSE':
    case 'JP':
      return 'JP';
    case 'SINGAPORE':
    case 'SGX':
    case 'SG':
      return 'SGX';
    case 'US':
    case 'NYSE':
    case 'NASDAQ':
    case 'AMEX':
      return 'US';
    default:
      return upper;
  }
}

/**
 * Normalize ticker to Yahoo Finance format based on market
 * - China: auto-detect Shanghai (.SS) vs Shenzhen (.SZ) based on code prefix
 * - HK: add .HK suffix
 * - JP: add .T suffix
 * - SGX: add .SI suffix
 * - US: no suffix needed
 */
function normalizeTickerForMarket(ticker: string, market: string): string {
  const cleaned = ticker.toUpperCase().trim();
  const upperMarket = market.toUpperCase();
  
  // If already has a suffix, return as-is
  if (cleaned.includes('.')) {
    return cleaned;
  }
  
  switch (upperMarket) {
    case 'CN':
    case 'CHINA': {
      // China A-shares: detect exchange from code prefix
      // Shanghai (SSE): 600xxx, 601xxx, 603xxx, 605xxx, 688xxx (STAR)
      // Shenzhen (SZSE): 000xxx, 001xxx, 002xxx, 003xxx, 300xxx (ChiNext), 301xxx
      const code = cleaned.replace(/\D/g, ''); // Extract numeric part
      if (code.startsWith('6')) {
        return `${code}.SS`; // Shanghai
      } else if (code.startsWith('0') || code.startsWith('3')) {
        return `${code}.SZ`; // Shenzhen
      }
      // Default to Shenzhen for unknown patterns
      return `${code}.SZ`;
    }
    
    case 'HK':
    case 'HKEX':
      // HK stocks: pad to 4 digits and add .HK
      const hkCode = cleaned.replace(/\D/g, '').padStart(4, '0');
      return `${hkCode}.HK`;
    
    case 'JP':
    case 'JAPAN':
    case 'TSE':
      // Japanese stocks: add .T suffix
      const jpCode = cleaned.replace(/\D/g, '');
      return `${jpCode}.T`;
    
    case 'SG':
    case 'SGX':
    case 'SINGAPORE':
      // Singapore stocks: add .SI suffix
      return `${cleaned}.SI`;
    
    case 'US':
    case 'NYSE':
    case 'NASDAQ':
    default:
      // US stocks: no suffix needed
      return cleaned;
  }
}

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
      const { ticker, market, name, sector, source, notes } = item;

      if (!ticker || !market) {
        results.push({ ticker, error: "ticker and market required" });
        continue;
      }

      try {
        // Normalize ticker for Yahoo Finance format
        const normalizedTicker = normalizeTickerForMarket(ticker, market);
        // Normalize market code (CN -> CN, CHINA -> CN, etc.)
        const normalizedMarket = normalizeMarketCode(market);
        
        await db
          .insert(scannerUniverse)
          .values({
            ticker: normalizedTicker,
            market: normalizedMarket,
            name,
            sector,
            source: source || "user",
            notes,
          })
          .onConflictDoUpdate({
            target: scannerUniverse.ticker,
            set: {
              name,
              sector,
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
