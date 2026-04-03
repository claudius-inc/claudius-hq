import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goldAnalysis, goldFlows } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

// Latest CPI YoY (updated periodically - fallback for TNX-CPI hack)
const LATEST_CPI_YOY = 2.9;

const FRED_API_KEY = process.env.FRED_API_KEY;

async function fetchFredValue(seriesId: string): Promise<number | null> {
  if (!FRED_API_KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = data.observations?.find((o: { value: string }) => o.value !== ".");
    return obs ? parseFloat(obs.value) : null;
  } catch {
    return null;
  }
}

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

interface HistoricalRow {
  date: Date;
  close: number | null;
}

/** Compute EMA from daily closes */
function computeEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return Math.round(ema * 100) / 100;
}

async function fetchGoldData() {
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

  let livePrice = null;
  let gldData = null;
  let dxyData = null;
  let realYieldsData = null;

  // Live ratios
  let ratios: {
    dowGold: number | null;
    goldSilver: number | null;
    m2Gold: number | null;
    m2Value: number | null; // Raw M2 money supply in trillions
  } = { dowGold: null, goldSilver: null, m2Gold: null, m2Value: null };

  // Moving averages
  let movingAverages: {
    ema50: number | null;
    ema200: number | null;
  } = { ema50: null, ema200: null };

  // Track GC=F change data separately
  let gcfChange: number | null = null;
  let gcfChangePercent: number | null = null;

  try {
    const gcQuote = await yahooFinance.quote("GC=F") as QuoteResult;
    livePrice = gcQuote.regularMarketPrice || null;
    gcfChange = gcQuote.regularMarketChange ?? null;
    gcfChangePercent = gcQuote.regularMarketChangePercent ?? null;

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

    // Fetch ratios in parallel
    try {
      const [djiQuote, siQuote, dxyQuote, tnxQuote, tipsValue] = await Promise.all([
        yahooFinance.quote("^DJI") as Promise<QuoteResult>,
        yahooFinance.quote("SI=F") as Promise<QuoteResult>,
        yahooFinance.quote("DX-Y.NYB") as Promise<QuoteResult>,
        yahooFinance.quote("^TNX") as Promise<QuoteResult>,
        fetchFredValue("DFII10"),
      ]);

      // Ratios
      if (livePrice && djiQuote.regularMarketPrice) {
        ratios.dowGold = Math.round((djiQuote.regularMarketPrice / livePrice) * 100) / 100;
      }
      if (livePrice && siQuote.regularMarketPrice) {
        ratios.goldSilver = Math.round((livePrice / siQuote.regularMarketPrice) * 100) / 100;
      }
      // M2/Gold: latest FRED M2 (billions from FRED) vs gold price
      const m2Billions = await fetchFredValue("M2SL"); // M2 in billions
      if (m2Billions && livePrice) {
        ratios.m2Gold = Math.round((m2Billions / livePrice) * 100) / 100;
        ratios.m2Value = Math.round(m2Billions / 100) / 10; // Convert to trillions with 1 decimal
      }

      // DXY
      if (dxyQuote.regularMarketPrice) {
        dxyData = {
          price: dxyQuote.regularMarketPrice,
          change: dxyQuote.regularMarketChange || 0,
          changePercent: dxyQuote.regularMarketChangePercent || 0,
        };
      }

      // Real yields
      const tnxPrice = tnxQuote.regularMarketPrice ?? null;
      if (tipsValue !== null || tnxPrice !== null) {
        const realYield = tipsValue ?? (tnxPrice! - LATEST_CPI_YOY);
        realYieldsData = {
          value: realYield,
          tips: tipsValue,
          tnx: tnxPrice,
          cpi: LATEST_CPI_YOY,
          change: tnxQuote.regularMarketChange || 0,
          changePercent: tnxQuote.regularMarketChangePercent || 0,
        };
      }
    } catch (e) {
      logger.error("api/gold", "Error fetching macro/ratio data", { error: e });
    }

    // Fetch daily historical for EMAs
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 300); // ~300 calendar days for 200 trading days
      const hist = (await yahooFinance.chart("GC=F", {
        period1: startDate,
        period2: new Date(),
        interval: "1d",
      })).quotes as HistoricalRow[];

      const closes = hist
        .map((h) => h.close)
        .filter((c): c is number => c !== null && c > 0);

      movingAverages.ema50 = computeEma(closes, 50);
      movingAverages.ema200 = computeEma(closes, 200);
    } catch (e) {
      logger.error("api/gold", "Error fetching gold historical for EMAs", { error: e });
    }
  } catch (e) {
    logger.error("api/gold", "Error fetching gold price", { error: e });
  }

  const currentAnalysis = analysis[0] || null;

  let keyLevels: unknown[] = [];
  let catalysts: { bull: string[]; bear: string[] } | null = null;
  if (currentAnalysis) {
    try {
      keyLevels = currentAnalysis.keyLevels ? JSON.parse(currentAnalysis.keyLevels) : [];
    } catch (e) {
      logger.error("api/gold", "Error parsing keyLevels JSON", { error: e });
    }
    try {
      catalysts = currentAnalysis.catalysts ? JSON.parse(currentAnalysis.catalysts) : null;
    } catch (e) {
      logger.error("api/gold", "Error parsing catalysts JSON", { error: e });
    }
  }

  return {
    analysis: currentAnalysis ? {
      ...currentAnalysis,
      keyLevels,
      catalysts,
    } : null,
    livePrice,
    change: gcfChange,
    changePercent: gcfChangePercent,
    gld: gldData,
    dxy: dxyData,
    realYields: realYieldsData,
    ratios,
    movingAverages,
    flows: flows.map(f => ({ ...f })),
  };
}

// GET /api/gold - Returns current analysis, live price, and recent flows
export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      // Reduced TTL from 300s to 60s for fresher data
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.GOLD, 60);
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchGoldData()
          .then((data) => setCache(CACHE_KEYS.GOLD, data))
          .catch((e) => logger.error("api/gold", "Background gold refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchGoldData();
    await setCache(CACHE_KEYS.GOLD, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/gold", "Gold API error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/gold - Update analysis (admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyLevels, scenarios, thesisNotes, ath, athDate, cyclePhase, catalysts } = body;

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
      cyclePhase: cyclePhase ?? null,
      catalysts: catalysts ? JSON.stringify(catalysts) : null,
      updatedAt: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await db
        .update(goldAnalysis)
        .set(data)
        .where(eq(goldAnalysis.id, existing[0].id));
    } else {
      await db.insert(goldAnalysis).values(data);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("api/gold", "Gold analysis update error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
