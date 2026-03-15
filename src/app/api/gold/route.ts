import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
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

  try {
    const gcQuote = await yahooFinance.quote("GC=F") as QuoteResult;
    livePrice = gcQuote.regularMarketPrice || null;

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

    try {
      const dxyQuote = await yahooFinance.quote("DX-Y.NYB") as QuoteResult;
      if (dxyQuote.regularMarketPrice) {
        dxyData = {
          price: dxyQuote.regularMarketPrice,
          change: dxyQuote.regularMarketChange || 0,
          changePercent: dxyQuote.regularMarketChangePercent || 0,
        };
      }

      const tnxQuote = await yahooFinance.quote("^TNX") as QuoteResult;
      const tnxPrice = tnxQuote.regularMarketPrice ?? null;
      const tipsValue = await fetchFredValue("DFII10");

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
      logger.error("api/gold", "Error fetching macro data (DXY/TNX)", { error: e });
    }
  } catch (e) {
    logger.error("api/gold", "Error fetching gold price", { error: e });
  }

  const currentAnalysis = analysis[0] || null;

  let keyLevels: unknown[] = [];
  let scenarios: unknown[] = [];
  if (currentAnalysis) {
    try {
      keyLevels = currentAnalysis.keyLevels ? JSON.parse(currentAnalysis.keyLevels) : [];
      scenarios = currentAnalysis.scenarios ? JSON.parse(currentAnalysis.scenarios) : [];
    } catch (e) {
      logger.error("api/gold", "Error parsing JSON", { error: e });
    }
  }

  return {
    analysis: currentAnalysis ? {
      ...currentAnalysis,
      keyLevels,
      scenarios,
    } : null,
    livePrice,
    gld: gldData,
    dxy: dxyData,
    realYields: realYieldsData,
    flows: flows.map(f => ({ ...f })),
  };
}

// GET /api/gold - Returns current analysis, live price, and recent flows
export async function GET(request: NextRequest) {
  if (!checkApiAuth(request)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(request)) return unauthorizedResponse();
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.GOLD, 300);
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
    const { keyLevels, scenarios, thesisNotes, ath, athDate } = body;

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
