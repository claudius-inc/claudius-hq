import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goldAnalysis, goldFlows } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

// Cache for gold price and macro data
let priceCache: { price: number; timestamp: number } | null = null;
let macroCache: {
  dxy: { price: number; change: number; changePercent: number } | null;
  tnx: { price: number; change: number; changePercent: number } | null;
  timestamp: number;
} | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Latest CPI YoY (updated periodically - this is a fallback)
// In production, you'd fetch from FRED API
const LATEST_CPI_YOY = 2.9; // As of Jan 2025

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

// GET /api/gold - Returns current analysis, live price, and recent flows
export async function GET() {
  try {
    // Fetch analysis from DB
    const analysis = await db
      .select()
      .from(goldAnalysis)
      .orderBy(desc(goldAnalysis.id))
      .limit(1);

    // Fetch recent flows
    const flows = await db
      .select()
      .from(goldFlows)
      .orderBy(desc(goldFlows.date))
      .limit(90);

    // Fetch live gold price from Yahoo (GC=F or GLD)
    let livePrice = null;
    let gldData = null;
    let dxyData = null;
    let realYieldsData = null;
    
    try {
      // Check cache
      if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL) {
        livePrice = priceCache.price;
      } else {
        // Fetch GC=F (Gold Futures)
        const gcQuote = await yahooFinance.quote("GC=F") as QuoteResult;
        livePrice = gcQuote.regularMarketPrice || null;
        
        if (livePrice) {
          priceCache = { price: livePrice, timestamp: Date.now() };
        }
      }

      // Fetch GLD for ETF data
      const gldQuote = await yahooFinance.quote("GLD") as QuoteResult & {
        sharesOutstanding?: number;
      };
      gldData = {
        price: gldQuote.regularMarketPrice,
        sharesOutstanding: gldQuote.sharesOutstanding,
        fiftyTwoWeekHigh: gldQuote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: gldQuote.fiftyTwoWeekLow,
        change: gldQuote.regularMarketChange,
        changePercent: gldQuote.regularMarketChangePercent,
      };

      // Fetch DXY (Dollar Index) and TNX (10Y Treasury) for gold drivers
      if (macroCache && Date.now() - macroCache.timestamp < CACHE_TTL) {
        dxyData = macroCache.dxy;
        if (macroCache.tnx) {
          const realYield = macroCache.tnx.price - LATEST_CPI_YOY;
          realYieldsData = {
            value: realYield,
            tnx: macroCache.tnx.price,
            cpi: LATEST_CPI_YOY,
            change: macroCache.tnx.change, // basis points change in TNX
            changePercent: macroCache.tnx.changePercent,
          };
        }
      } else {
        try {
          // Fetch DXY (Dollar Index futures)
          const dxyQuote = await yahooFinance.quote("DX-Y.NYB") as QuoteResult;
          if (dxyQuote.regularMarketPrice) {
            dxyData = {
              price: dxyQuote.regularMarketPrice,
              change: dxyQuote.regularMarketChange || 0,
              changePercent: dxyQuote.regularMarketChangePercent || 0,
            };
          }

          // Fetch TNX (10Y Treasury Yield)
          const tnxQuote = await yahooFinance.quote("^TNX") as QuoteResult;
          let tnxData = null;
          if (tnxQuote.regularMarketPrice) {
            tnxData = {
              price: tnxQuote.regularMarketPrice,
              change: tnxQuote.regularMarketChange || 0,
              changePercent: tnxQuote.regularMarketChangePercent || 0,
            };
            
            // Calculate real yields: TNX - CPI YoY
            const realYield = tnxQuote.regularMarketPrice - LATEST_CPI_YOY;
            realYieldsData = {
              value: realYield,
              tnx: tnxQuote.regularMarketPrice,
              cpi: LATEST_CPI_YOY,
              change: tnxQuote.regularMarketChange || 0,
              changePercent: tnxQuote.regularMarketChangePercent || 0,
            };
          }

          // Update macro cache
          macroCache = {
            dxy: dxyData,
            tnx: tnxData,
            timestamp: Date.now(),
          };
        } catch (e) {
          console.error("Error fetching macro data (DXY/TNX):", e);
        }
      }
    } catch (e) {
      console.error("Error fetching gold price:", e);
    }

    const currentAnalysis = analysis[0] || null;

    // Parse JSON fields
    let keyLevels = [];
    let scenarios = [];
    if (currentAnalysis) {
      try {
        keyLevels = currentAnalysis.keyLevels ? JSON.parse(currentAnalysis.keyLevels) : [];
        scenarios = currentAnalysis.scenarios ? JSON.parse(currentAnalysis.scenarios) : [];
      } catch (e) {
        console.error("Error parsing JSON:", e);
      }
    }

    return NextResponse.json({
      analysis: currentAnalysis ? {
        ...currentAnalysis,
        keyLevels,
        scenarios,
      } : null,
      livePrice,
      gld: gldData,
      dxy: dxyData,
      realYields: realYieldsData,
      flows: flows.map(f => ({
        ...f,
      })),
    });
  } catch (e) {
    console.error("Gold API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/gold - Update analysis (admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyLevels, scenarios, thesisNotes, ath, athDate } = body;

    // Check if we have an existing record
    const existing = await db
      .select()
      .from(goldAnalysis)
      .orderBy(desc(goldAnalysis.id))
      .limit(1);

    const data = {
      keyLevels: keyLevels ? JSON.stringify(keyLevels) : null,
      scenarios: scenarios ? JSON.stringify(scenarios) : null,
      thesisNotes: thesisNotes || null,
      ath: ath || null,
      athDate: athDate || null,
      updatedAt: new Date().toISOString(),
    };

    if (existing.length > 0) {
      // Update existing
      await db
        .update(goldAnalysis)
        .set(data)
        .where(eq(goldAnalysis.id, existing[0].id));
    } else {
      // Insert new
      await db.insert(goldAnalysis).values(data);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Gold analysis update error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
