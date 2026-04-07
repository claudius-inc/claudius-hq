/**
 * Gold dashboard data fetcher — extracted from src/app/api/gold/route.ts so
 * it can be called directly during SSR from /markets without going through
 * HTTP. The route file becomes a thin wrapper around `fetchGoldData()`.
 *
 * Also exposes `fetchGoldDataLite()` returning ONLY the two fields the
 * regime-detection logic needs (`realYields.value`, `dxy.price`), so the
 * SSR cost stays bounded for /markets where we only need those.
 */
import { db } from "@/db";
import { goldAnalysis, goldFlows } from "@/db/schema";
import { desc } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const LOG_SRC = "lib/gold";
const LATEST_CPI_YOY = 2.9;
const FRED_API_KEY = process.env.FRED_API_KEY;

async function fetchFredValue(seriesId: string): Promise<number | null> {
  if (!FRED_API_KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = data.observations?.find(
      (o: { value: string }) => o.value !== ".",
    );
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

function computeEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return Math.round(ema * 100) / 100;
}

export async function fetchGoldData() {
  const analysis = await db
    .select()
    .from(goldAnalysis)
    .orderBy(desc(goldAnalysis.id))
    .limit(1);

  const flows = await db
    .select()
    .from(goldFlows)
    .orderBy(desc(goldFlows.date))
    .limit(90);

  let livePrice: number | null = null;
  let gldData: {
    price: number | undefined;
    sharesOutstanding: number | undefined;
    fiftyTwoWeekHigh: number | undefined;
    fiftyTwoWeekLow: number | undefined;
    change: number | undefined;
    changePercent: number | undefined;
  } | null = null;
  let dxyData: {
    price: number;
    change: number;
    changePercent: number;
  } | null = null;
  let realYieldsData: {
    value: number;
    tips: number | null;
    tnx: number | null;
    cpi: number;
    change: number;
    changePercent: number;
  } | null = null;

  const ratios: {
    dowGold: number | null;
    goldSilver: number | null;
    m2Gold: number | null;
    m2Value: number | null;
  } = { dowGold: null, goldSilver: null, m2Gold: null, m2Value: null };

  const movingAverages: {
    ema50: number | null;
    ema200: number | null;
  } = { ema50: null, ema200: null };

  let gcfChange: number | null = null;
  let gcfChangePercent: number | null = null;
  let priceSource: "GC=F" | "GLD" = "GC=F";

  try {
    const gcQuote = (await yahooFinance.quote("GC=F")) as QuoteResult & {
      regularMarketTime?: number;
    };
    const gldQuote = (await yahooFinance.quote("GLD")) as QuoteResult & {
      sharesOutstanding?: number;
      regularMarketTime?: number;
    };

    const parseTime = (t: unknown): number => {
      if (!t) return 0;
      if (t instanceof Date) return t.getTime();
      if (typeof t === "string") return new Date(t).getTime();
      if (typeof t === "number") return t > 1e12 ? t : t * 1000;
      return 0;
    };
    const gcfTimestamp = parseTime(gcQuote.regularMarketTime);
    const gldTimestamp = parseTime(gldQuote.regularMarketTime);
    const now = Date.now();
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const gcfIsStale = gcfTimestamp > 0 && now - gcfTimestamp > twoHoursMs;
    const gldIsFresh = gldTimestamp > 0 && now - gldTimestamp < twoHoursMs;

    const gcfAgeMin =
      gcfTimestamp > 0 ? Math.round((now - gcfTimestamp) / 1000 / 60) : 9999;
    const gldAgeMin =
      gldTimestamp > 0 ? Math.round((now - gldTimestamp) / 1000 / 60) : 9999;

    const preferGld = gcfIsStale && (gldIsFresh || gldAgeMin < gcfAgeMin);

    if (preferGld && gldQuote.regularMarketPrice) {
      livePrice = Math.round(gldQuote.regularMarketPrice * 10 * 100) / 100;
      gcfChange = gldQuote.regularMarketChange
        ? gldQuote.regularMarketChange * 10
        : null;
      gcfChangePercent = gldQuote.regularMarketChangePercent ?? null;
      priceSource = "GLD";
      logger.warn(LOG_SRC, "GC=F data stale, using GLD×10", {
        gcfAge: gcfAgeMin + " min",
        gldAge: gldAgeMin + " min",
      });
    } else {
      livePrice = gcQuote.regularMarketPrice || null;
      gcfChange = gcQuote.regularMarketChange ?? null;
      gcfChangePercent = gcQuote.regularMarketChangePercent ?? null;
      if (gcfIsStale) {
        logger.warn(LOG_SRC, "Both GC=F and GLD data are stale", {
          gcfAge: gcfAgeMin + " min",
          gldAge: gldAgeMin + " min",
        });
      }
    }

    gldData = {
      price: gldQuote.regularMarketPrice,
      sharesOutstanding: gldQuote.sharesOutstanding,
      fiftyTwoWeekHigh: gldQuote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: gldQuote.fiftyTwoWeekLow,
      change: gldQuote.regularMarketChange,
      changePercent: gldQuote.regularMarketChangePercent,
    };

    try {
      const [djiQuote, siQuote, dxyQuote, tnxQuote, tipsValue] =
        await Promise.all([
          yahooFinance.quote("^DJI") as Promise<QuoteResult>,
          yahooFinance.quote("SI=F") as Promise<QuoteResult>,
          yahooFinance.quote("DX-Y.NYB") as Promise<QuoteResult>,
          yahooFinance.quote("^TNX") as Promise<QuoteResult>,
          fetchFredValue("DFII10"),
        ]);

      if (livePrice && djiQuote.regularMarketPrice) {
        ratios.dowGold =
          Math.round((djiQuote.regularMarketPrice / livePrice) * 100) / 100;
      }
      if (livePrice && siQuote.regularMarketPrice) {
        ratios.goldSilver =
          Math.round((livePrice / siQuote.regularMarketPrice) * 100) / 100;
      }
      const m2Billions = await fetchFredValue("M2SL");
      if (m2Billions && livePrice) {
        ratios.m2Gold = Math.round((m2Billions / livePrice) * 100) / 100;
        ratios.m2Value = Math.round(m2Billions / 100) / 10;
      }

      if (dxyQuote.regularMarketPrice) {
        dxyData = {
          price: dxyQuote.regularMarketPrice,
          change: dxyQuote.regularMarketChange || 0,
          changePercent: dxyQuote.regularMarketChangePercent || 0,
        };
      }

      const tnxPrice = tnxQuote.regularMarketPrice ?? null;
      if (tipsValue !== null || tnxPrice !== null) {
        const realYield = tipsValue ?? tnxPrice! - LATEST_CPI_YOY;
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
      logger.error(LOG_SRC, "Error fetching macro/ratio data", { error: e });
    }

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 300);
      const hist = (
        await yahooFinance.chart("GC=F", {
          period1: startDate,
          period2: new Date(),
          interval: "1d",
        })
      ).quotes as HistoricalRow[];

      const closes = hist
        .map((h) => h.close)
        .filter((c): c is number => c !== null && c > 0);

      movingAverages.ema50 = computeEma(closes, 50);
      movingAverages.ema200 = computeEma(closes, 200);
    } catch (e) {
      logger.error(LOG_SRC, "Error fetching gold historical for EMAs", {
        error: e,
      });
    }
  } catch (e) {
    logger.error(LOG_SRC, "Error fetching gold price", { error: e });
  }

  const currentAnalysis = analysis[0] || null;

  let keyLevels: unknown[] = [];
  let catalysts: { bull: string[]; bear: string[] } | null = null;
  if (currentAnalysis) {
    try {
      keyLevels = currentAnalysis.keyLevels
        ? JSON.parse(currentAnalysis.keyLevels)
        : [];
    } catch (e) {
      logger.error(LOG_SRC, "Error parsing keyLevels JSON", { error: e });
    }
    try {
      catalysts = currentAnalysis.catalysts
        ? JSON.parse(currentAnalysis.catalysts)
        : null;
    } catch (e) {
      logger.error(LOG_SRC, "Error parsing catalysts JSON", { error: e });
    }
  }

  return {
    analysis: currentAnalysis
      ? { ...currentAnalysis, keyLevels, catalysts }
      : null,
    livePrice,
    change: gcfChange,
    changePercent: gcfChangePercent,
    priceSource,
    gld: gldData,
    dxy: dxyData,
    realYields: realYieldsData,
    ratios,
    movingAverages,
    flows: flows.map((f) => ({ ...f })),
  };
}

/**
 * Slim variant returning only the two fields needed by the markets-page
 * regime detection: `realYields.value` and `dxy.price`. Skips analysis,
 * flows, EMAs, ratios, and the GLD price-source dance. Used by SSR on
 * /markets where we just need to seed `regimeData`.
 */
export interface GoldDataLite {
  realYields: { value: number } | null;
  dxy: { price: number } | null;
}

export async function fetchGoldDataLite(): Promise<GoldDataLite> {
  try {
    const [dxyQuote, tnxQuote, tipsValue] = await Promise.all([
      yahooFinance.quote("DX-Y.NYB") as Promise<QuoteResult>,
      yahooFinance.quote("^TNX") as Promise<QuoteResult>,
      fetchFredValue("DFII10"),
    ]);

    const tnxPrice = tnxQuote.regularMarketPrice ?? null;
    const realYieldValue =
      tipsValue !== null
        ? tipsValue
        : tnxPrice !== null
          ? tnxPrice - LATEST_CPI_YOY
          : null;

    return {
      realYields: realYieldValue !== null ? { value: realYieldValue } : null,
      dxy:
        dxyQuote.regularMarketPrice !== undefined
          ? { price: dxyQuote.regularMarketPrice }
          : null,
    };
  } catch (e) {
    logger.error(LOG_SRC, "fetchGoldDataLite error", { error: e });
    return { realYields: null, dxy: null };
  }
}
