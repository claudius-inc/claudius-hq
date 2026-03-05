import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketReference } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface QuoteResult {
  regularMarketPrice?: number;
}

// POST /api/markets/reference/refresh - Fetch live prices and update current_price
export async function POST() {
  try {
    // Get all references with yahoo tickers
    const references = await db.select().from(marketReference).all();
    
    const results: Array<{
      symbol: string;
      yahooTicker: string | null;
      oldPrice: number | null;
      newPrice: number | null;
      status: "updated" | "skipped" | "error";
      error?: string;
    }> = [];
    
    for (const ref of references) {
      if (!ref.yahooTicker) {
        results.push({
          symbol: ref.symbol,
          yahooTicker: null,
          oldPrice: ref.currentPrice,
          newPrice: null,
          status: "skipped",
          error: "No Yahoo ticker configured",
        });
        continue;
      }
      
      try {
        const quote = await yahooFinance.quote(ref.yahooTicker) as QuoteResult;
        const newPrice = quote?.regularMarketPrice ?? null;
        
        if (newPrice !== null) {
          await db
            .update(marketReference)
            .set({
              currentPrice: newPrice,
              updatedAt: sql`(datetime('now'))`,
            })
            .where(eq(marketReference.symbol, ref.symbol))
            .run();
          
          results.push({
            symbol: ref.symbol,
            yahooTicker: ref.yahooTicker,
            oldPrice: ref.currentPrice,
            newPrice,
            status: "updated",
          });
        } else {
          results.push({
            symbol: ref.symbol,
            yahooTicker: ref.yahooTicker,
            oldPrice: ref.currentPrice,
            newPrice: null,
            status: "error",
            error: "No price returned from Yahoo",
          });
        }
      } catch (error) {
        results.push({
          symbol: ref.symbol,
          yahooTicker: ref.yahooTicker,
          oldPrice: ref.currentPrice,
          newPrice: null,
          status: "error",
          error: String(error),
        });
      }
    }
    
    const updated = results.filter(r => r.status === "updated").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;
    
    return NextResponse.json({
      summary: {
        total: references.length,
        updated,
        skipped,
        errors,
      },
      results,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error refreshing market references:", error);
    return NextResponse.json(
      { error: "Failed to refresh market references" },
      { status: 500 }
    );
  }
}
