import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface BreadthData {
  advanceDecline: {
    advances: number | null;
    declines: number | null;
    unchanged: number | null;
    ratio: number | null;
    netAdvances: number | null;
  };
  newHighsLows: {
    newHighs: number | null;
    newLows: number | null;
    ratio: number | null;
    netHighs: number | null;
  };
  level: "bullish" | "neutral" | "bearish";
  interpretation: string;
}

// Fetch market breadth from major indices components
async function fetchBreadthFromIndex(): Promise<BreadthData> {
  try {
    const [spyQuote, qqqQuote, iwmQuote] = await Promise.all([
      yahooFinance.quote("SPY"),
      yahooFinance.quote("QQQ"),
      yahooFinance.quote("IWM"),
    ]);

    try {
      await yahooFinance.quoteSummary("^GSPC", { modules: ["summaryDetail", "price"] });
    } catch {
      // Fallback: estimate from ETF performance
    }

    const spyChange = (spyQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    const qqqChange = (qqqQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    const iwmChange = (iwmQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;

    const breadthSignal = iwmChange - spyChange;
    const avgChange = (spyChange + qqqChange + iwmChange) / 3;

    let advances: number;
    let declines: number;
    if (avgChange > 0.5) {
      advances = Math.round(2000 + avgChange * 200);
      declines = Math.round(1200 - avgChange * 100);
    } else if (avgChange < -0.5) {
      advances = Math.round(1200 + avgChange * 100);
      declines = Math.round(2000 - avgChange * 200);
    } else {
      advances = 1600;
      declines = 1600;
    }

    let newHighs: number;
    let newLows: number;
    if (avgChange > 1) {
      newHighs = Math.round(100 + avgChange * 30);
      newLows = Math.round(20 - avgChange * 5);
    } else if (avgChange < -1) {
      newHighs = Math.round(20 + avgChange * 5);
      newLows = Math.round(100 - avgChange * 30);
    } else {
      newHighs = 50;
      newLows = 50;
    }

    const adRatio = declines > 0 ? advances / declines : advances > 0 ? 2 : 1;
    const hlRatio = newLows > 0 ? newHighs / newLows : newHighs > 0 ? 2 : 1;

    let level: "bullish" | "neutral" | "bearish";
    let interpretation: string;

    if (adRatio > 1.5 && hlRatio > 1.5) {
      level = "bullish";
      interpretation = "Strong breadth - broad market participation in rally";
    } else if (adRatio < 0.7 || hlRatio < 0.5) {
      level = "bearish";
      interpretation = "Weak breadth - selling pressure widespread";
    } else if (breadthSignal > 1) {
      level = "bullish";
      interpretation = "Small caps leading - risk-on breadth";
    } else if (breadthSignal < -1) {
      level = "bearish";
      interpretation = "Large caps leading - narrow market, defensive breadth";
    } else {
      level = "neutral";
      interpretation = "Mixed breadth signals";
    }

    return {
      advanceDecline: {
        advances,
        declines,
        unchanged: Math.round((advances + declines) * 0.05),
        ratio: Math.round(adRatio * 100) / 100,
        netAdvances: advances - declines,
      },
      newHighsLows: {
        newHighs,
        newLows,
        ratio: Math.round(hlRatio * 100) / 100,
        netHighs: newHighs - newLows,
      },
      level,
      interpretation,
    };
  } catch (e) {
    logger.error("api/markets/breadth", "Failed to fetch breadth data", { error: e });
    return {
      advanceDecline: {
        advances: null,
        declines: null,
        unchanged: null,
        ratio: null,
        netAdvances: null,
      },
      newHighsLows: {
        newHighs: null,
        newLows: null,
        ratio: null,
        netHighs: null,
      },
      level: "neutral",
      interpretation: "Data unavailable",
    };
  }
}

// Fetch McClellan Oscillator approximation
async function fetchMcClellanData() {
  try {
    const [spyHistory] = await Promise.all([
      yahooFinance.historical("SPY", {
        period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: "1d",
      }),
    ]);

    if (!spyHistory || spyHistory.length < 39) {
      return { oscillator: null, signal: null };
    }

    const returns = spyHistory.slice(-40).map((d, i, arr) =>
      i > 0 ? ((d.close || 0) - (arr[i-1]?.close || 0)) / (arr[i-1]?.close || 1) : 0
    ).slice(1);

    const ema19 = calculateEMA(returns, 19);
    const ema39 = calculateEMA(returns, 39);

    const oscillator = (ema19 - ema39) * 1000;

    return {
      oscillator: Math.round(oscillator * 10) / 10,
      signal: oscillator > 0 ? "bullish" : oscillator < 0 ? "bearish" : "neutral",
    };
  } catch (e) {
    logger.error("api/markets/breadth", "McClellan calculation error", { error: e });
    return { oscillator: null, signal: null };
  }
}

function calculateEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }

  return ema;
}

async function fetchBreadthData() {
  const [breadth, mcclellan] = await Promise.all([
    fetchBreadthFromIndex(),
    fetchMcClellanData(),
  ]);

  return {
    ...breadth,
    mcclellan,
    source: "Estimated from market ETFs",
    note: "NYSE advance/decline and new highs/lows approximated from broad market ETF performance",
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.BREADTH, 900);
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchBreadthData()
          .then((data) => setCache(CACHE_KEYS.BREADTH, data))
          .catch((e) => logger.error("api/markets/breadth", "Background breadth refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchBreadthData();
    await setCache(CACHE_KEYS.BREADTH, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/markets/breadth", "Breadth API error", { error: e });
    return NextResponse.json({
      advanceDecline: { advances: null, declines: null, unchanged: null, ratio: null, netAdvances: null },
      newHighsLows: { newHighs: null, newLows: null, ratio: null, netHighs: null },
      level: "neutral",
      interpretation: "Data unavailable",
      mcclellan: { oscillator: null, signal: null },
      error: String(e),
      updatedAt: new Date().toISOString(),
    });
  }
}
