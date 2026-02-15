import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goldFlows } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface QuoteResult {
  regularMarketPrice?: number;
  sharesOutstanding?: number;
}

// GET /api/gold/flows - List flow history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "90");

    const flows = await db
      .select()
      .from(goldFlows)
      .orderBy(desc(goldFlows.date))
      .limit(limit);

    return NextResponse.json({ flows });
  } catch (e) {
    console.error("Gold flows API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/gold/flows - Manual flow entry or sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, date, gldSharesOutstanding, gldNav, globalEtfFlowUsd, centralBankTonnes, source } = body;

    if (action === "sync") {
      // Sync from Yahoo Finance
      return await syncGldData();
    }

    // Manual entry
    if (!date) {
      return NextResponse.json({ error: "Date required" }, { status: 400 });
    }

    // Check if entry exists for this date
    const existing = await db
      .select()
      .from(goldFlows)
      .where(eq(goldFlows.date, date))
      .limit(1);

    const data = {
      date,
      gldSharesOutstanding: gldSharesOutstanding || null,
      gldNav: gldNav || null,
      globalEtfFlowUsd: globalEtfFlowUsd || null,
      centralBankTonnes: centralBankTonnes || null,
      source: source || "manual",
    };

    if (existing.length > 0) {
      // Calculate estimated flow if we have previous day's data
      let estimatedFlowUsd = null;
      if (gldSharesOutstanding && gldNav) {
        const prevDay = await db
          .select()
          .from(goldFlows)
          .where(eq(goldFlows.date, getPreviousDate(date)))
          .limit(1);
        
        if (prevDay.length > 0 && prevDay[0].gldSharesOutstanding) {
          const sharesDiff = gldSharesOutstanding - prevDay[0].gldSharesOutstanding;
          estimatedFlowUsd = sharesDiff * gldNav;
        }
      }

      await db
        .update(goldFlows)
        .set({ ...data, estimatedFlowUsd })
        .where(eq(goldFlows.id, existing[0].id));
    } else {
      await db.insert(goldFlows).values(data);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Gold flows update error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Sync GLD data from Yahoo Finance
async function syncGldData() {
  try {
    // Fetch GLD quote
    const gldQuote = await yahooFinance.quote("GLD") as QuoteResult;
    
    if (!gldQuote.regularMarketPrice) {
      return NextResponse.json({ error: "Could not fetch GLD data" }, { status: 500 });
    }

    const today = new Date().toISOString().split("T")[0];
    const gldNav = gldQuote.regularMarketPrice;
    const sharesOutstanding = gldQuote.sharesOutstanding;

    // Check for existing entry today
    const existing = await db
      .select()
      .from(goldFlows)
      .where(eq(goldFlows.date, today))
      .limit(1);

    // Calculate estimated flow
    let estimatedFlowUsd = null;
    if (sharesOutstanding) {
      const prevDay = await db
        .select()
        .from(goldFlows)
        .orderBy(desc(goldFlows.date))
        .limit(1);
      
      if (prevDay.length > 0 && prevDay[0].gldSharesOutstanding) {
        const sharesDiff = sharesOutstanding - prevDay[0].gldSharesOutstanding;
        estimatedFlowUsd = sharesDiff * gldNav;
      }
    }

    const data = {
      date: today,
      gldSharesOutstanding: sharesOutstanding || null,
      gldNav,
      estimatedFlowUsd,
      source: "yahoo" as const,
    };

    if (existing.length > 0) {
      await db
        .update(goldFlows)
        .set(data)
        .where(eq(goldFlows.id, existing[0].id));
    } else {
      await db.insert(goldFlows).values(data);
    }

    return NextResponse.json({ 
      success: true, 
      synced: {
        date: today,
        gldNav,
        sharesOutstanding,
        estimatedFlowUsd,
      }
    });
  } catch (e) {
    console.error("GLD sync error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function getPreviousDate(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}
