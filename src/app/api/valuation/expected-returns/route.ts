/**
 * Expected Returns API - Phase 2
 * 
 * Fetches current valuations for major asset classes and calculates
 * expected 10-year real returns based on historical relationships.
 * 
 * Phase 2: Enhanced tactical overlay with RSI, VIX, yield curve, sentiment.
 */

import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import type {
  ExpectedReturnsResponse,
  AssetValuation,
  AssetSymbol,
  TacticalOverlay,
  TacticalSummary,
  SignalAlignment,
  SentimentLevel,
  PositioningZone,
} from "@/lib/valuation/types";
import {
  calculateSpyValuation,
  calculateGoldValuation,
  calculateBtcValuation,
  calculateBondValuation,
  getBtcCyclePosition,
  determineTacticalSignal,
  determineMomentum,
  rankAssetsByExpectedReturn,
} from "@/lib/valuation/expected-returns";

export const dynamic = "force-dynamic";

const CACHE_KEY = "valuation:expected-returns";
const CACHE_MAX_AGE = 60 * 60; // 1 hour

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface QuoteResult {
  regularMarketPrice?: number;
  trailingPE?: number;
  twoHundredDayAverage?: number;
  fiftyDayAverage?: number;
  regularMarketChangePercent?: number;
}

interface ChartQuote {
  close: number | null;
  high?: number | null;
  low?: number | null;
}

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

// ---------------------------------------------------------------------------
// Data Fetchers
// ---------------------------------------------------------------------------

async function fetchM2(): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      logger.error("api/valuation/expected-returns", `FRED M2 error: ${res.status}`);
      return null;
    }

    const data: FredResponse = await res.json();
    if (data.observations.length === 0 || data.observations[0].value === ".") {
      return null;
    }

    return parseFloat(data.observations[0].value);
  } catch (error) {
    logger.error("api/valuation/expected-returns", "Error fetching M2", { error });
    return null;
  }
}

async function fetchQuote(
  symbol: string
): Promise<{ price: number; sma200: number; sma50: number; pe?: number; changePercent?: number } | null> {
  try {
    const quote = (await yahooFinance.quote(symbol)) as QuoteResult;

    if (!quote.regularMarketPrice) return null;

    return {
      price: quote.regularMarketPrice,
      sma200: quote.twoHundredDayAverage || quote.regularMarketPrice,
      sma50: quote.fiftyDayAverage || quote.regularMarketPrice,
      pe: quote.trailingPE,
      changePercent: quote.regularMarketChangePercent,
    };
  } catch (error) {
    logger.error("api/valuation/expected-returns", `Error fetching ${symbol}`, { error });
    return null;
  }
}

async function fetchHistoricalData(
  symbol: string,
  days: number = 300
): Promise<{ closes: number[]; highs: number[]; lows: number[] } | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const chart = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    const quotes = chart.quotes as ChartQuote[];
    const closes = quotes
      .map((q) => q.close)
      .filter((c): c is number => c !== null && c !== undefined);
    const highs = quotes
      .map((q) => q.high)
      .filter((h): h is number => h !== null && h !== undefined);
    const lows = quotes
      .map((q) => q.low)
      .filter((l): l is number => l !== null && l !== undefined);

    return { closes, highs, lows };
  } catch (error) {
    logger.error("api/valuation/expected-returns", `Error fetching history for ${symbol}`, { error });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Technical Indicators
// ---------------------------------------------------------------------------

function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  const recentCloses = closes.slice(-period - 1);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < recentCloses.length; i++) {
    const change = recentCloses[i] - recentCloses[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ---------------------------------------------------------------------------
// Sentiment & Positioning
// ---------------------------------------------------------------------------

function determineBtcSentiment(
  price: number,
  sma200: number,
  rsi: number | null,
  changePercent: number | null
): SentimentLevel {
  // Proxy for Fear & Greed based on available data
  let score = 50; // neutral

  // Position vs 200 DMA
  const deviation = ((price - sma200) / sma200) * 100;
  if (deviation > 30) score += 25;
  else if (deviation > 15) score += 15;
  else if (deviation > 0) score += 5;
  else if (deviation < -30) score -= 25;
  else if (deviation < -15) score -= 15;
  else if (deviation < 0) score -= 5;

  // RSI contribution
  if (rsi !== null) {
    if (rsi > 80) score += 20;
    else if (rsi > 70) score += 10;
    else if (rsi < 20) score -= 20;
    else if (rsi < 30) score -= 10;
  }

  // Recent momentum
  if (changePercent !== null) {
    if (changePercent > 5) score += 10;
    else if (changePercent < -5) score -= 10;
  }

  // Map score to sentiment
  if (score >= 75) return "extreme-greed";
  if (score >= 55) return "greed";
  if (score <= 25) return "extreme-fear";
  if (score <= 45) return "fear";
  return "neutral";
}

function determineGoldPositioning(): PositioningZone {
  // CFTC COT data is weekly and requires separate API
  // For now, use neutral as default with note to user
  // In production, would fetch from Quandl or similar
  return "neutral";
}

function getVixBias(vix: number): "bullish" | "neutral" | "bearish" {
  // VIX interpretation:
  // < 15: Complacent (can be contrarian bearish)
  // 15-25: Normal
  // > 25: Fear (can be contrarian bullish)
  // > 35: Extreme fear (strong contrarian bullish)
  if (vix > 35) return "bullish"; // Extreme fear = contrarian buy signal
  if (vix > 25) return "neutral"; // Elevated but not extreme
  if (vix < 12) return "bearish"; // Extreme complacency = caution
  return "neutral";
}

function getRsiBias(rsi: number | null): "bullish" | "neutral" | "bearish" {
  if (rsi === null) return "neutral";
  if (rsi > 70) return "bearish"; // Overbought
  if (rsi < 30) return "bullish"; // Oversold
  return "neutral";
}

function getYieldCurveBias(slope: number): "bullish" | "neutral" | "bearish" {
  // Positive slope (10Y > 2Y) = normal, economically constructive
  // Negative slope = inverted, recession warning
  if (slope < -0.5) return "bearish"; // Deeply inverted
  if (slope < 0) return "neutral"; // Mildly inverted
  if (slope > 1) return "bullish"; // Steep positive slope
  return "neutral";
}

// ---------------------------------------------------------------------------
// Tactical Bias Calculator
// ---------------------------------------------------------------------------

function calculateTacticalBias(
  vs200dma: "below" | "at" | "above",
  vs50dma: "below" | "at" | "above" | undefined,
  rsi: number | null,
  vix: number | undefined,
  yieldCurveSlope: number | undefined,
  sentiment: SentimentLevel | undefined
): { bias: "bullish" | "neutral" | "bearish"; note: string } {
  let bullishSignals = 0;
  let bearishSignals = 0;
  const notes: string[] = [];

  // 200 DMA
  if (vs200dma === "above") bullishSignals++;
  else if (vs200dma === "below") bearishSignals++;

  // 50 DMA
  if (vs50dma === "above") bullishSignals++;
  else if (vs50dma === "below") bearishSignals++;

  // RSI
  if (rsi !== null) {
    if (rsi > 70) {
      bearishSignals++;
      notes.push("overbought");
    } else if (rsi < 30) {
      bullishSignals++;
      notes.push("oversold");
    }
  }

  // VIX (contrarian)
  if (vix !== undefined) {
    const vixBias = getVixBias(vix);
    if (vixBias === "bullish") {
      bullishSignals++;
      notes.push("fear spike");
    } else if (vixBias === "bearish") {
      bearishSignals++;
      notes.push("complacent");
    }
  }

  // Yield curve
  if (yieldCurveSlope !== undefined) {
    const curveBias = getYieldCurveBias(yieldCurveSlope);
    if (curveBias === "bearish") {
      bearishSignals++;
      notes.push("curve inverted");
    } else if (curveBias === "bullish") {
      bullishSignals++;
    }
  }

  // Sentiment
  if (sentiment !== undefined) {
    if (sentiment === "extreme-fear" || sentiment === "fear") {
      bullishSignals++; // Contrarian
      notes.push("fear");
    } else if (sentiment === "extreme-greed" || sentiment === "greed") {
      bearishSignals++; // Contrarian
      notes.push("euphoria");
    }
  }

  // Determine bias
  let bias: "bullish" | "neutral" | "bearish" = "neutral";
  if (bullishSignals > bearishSignals + 1) bias = "bullish";
  else if (bearishSignals > bullishSignals + 1) bias = "bearish";

  return {
    bias,
    note: notes.length > 0 ? notes.slice(0, 2).join(", ") : undefined,
  } as { bias: "bullish" | "neutral" | "bearish"; note: string };
}

// ---------------------------------------------------------------------------
// Tactical Summary Calculator
// ---------------------------------------------------------------------------

function calculateTacticalSummary(assets: AssetValuation[]): TacticalSummary {
  const aligned: AssetSymbol[] = [];
  const divergent: AssetSymbol[] = [];

  for (const asset of assets) {
    const strategicBias =
      asset.valuation.zone === "cheap"
        ? "bullish"
        : asset.valuation.zone === "expensive"
        ? "bearish"
        : "neutral";

    const tacticalBias = asset.tactical.bias;

    if (strategicBias === tacticalBias || strategicBias === "neutral" || tacticalBias === "neutral") {
      aligned.push(asset.symbol);
    } else {
      divergent.push(asset.symbol);
    }
  }

  // Determine overall alignment
  let alignment: SignalAlignment;
  const alignedBullish = assets.filter(
    (a) =>
      aligned.includes(a.symbol) &&
      a.valuation.zone === "cheap" &&
      a.tactical.bias === "bullish"
  ).length;
  const alignedBearish = assets.filter(
    (a) =>
      aligned.includes(a.symbol) &&
      a.valuation.zone === "expensive" &&
      a.tactical.bias === "bearish"
  ).length;

  if (alignedBullish >= 2) alignment = "strong-buy";
  else if (alignedBullish >= 1 && divergent.length === 0) alignment = "buy";
  else if (alignedBearish >= 2) alignment = "strong-sell";
  else if (alignedBearish >= 1 && divergent.length === 0) alignment = "sell";
  else alignment = "mixed";

  // Generate message
  let message: string;
  if (alignment === "strong-buy") {
    message = `Strong setup: ${aligned.filter((s) => assets.find((a) => a.symbol === s)?.valuation.zone === "cheap").join(", ")} cheap and trending up`;
  } else if (alignment === "strong-sell") {
    message = `Caution: multiple assets expensive and weakening`;
  } else if (divergent.length > 0) {
    message = `Mixed signals on ${divergent.join(", ")} - tactical diverges from valuation`;
  } else {
    message = `No strong conviction - monitor for clearer signals`;
  }

  return { alignment, message, aligned, divergent };
}

// ---------------------------------------------------------------------------
// Main Fetch Function
// ---------------------------------------------------------------------------

interface GoldApiResponse {
  livePrice: number | null;
  gld?: {
    price?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
  };
}

async function fetchGoldPrice(): Promise<{ price: number; sma200: number; sma50: number } | null> {
  try {
    // Use internal gold API for accurate gold price
    // Fix: proper URL construction with correct ternary precedence
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const goldRes = await fetch(`${baseUrl}/api/gold`, { cache: "no-store" });
    
    if (!goldRes.ok) {
      // Fallback to GLD ETF * 10
      const gldQuote = await fetchQuote("GLD");
      if (gldQuote) {
        return {
          price: gldQuote.price * 10,
          sma200: gldQuote.sma200 * 10,
          sma50: gldQuote.sma50 * 10,
        };
      }
      return null;
    }
    
    const goldData: GoldApiResponse = await goldRes.json();
    if (!goldData.livePrice) {
      // Fallback to GLD ETF * 10
      const gldQuote = await fetchQuote("GLD");
      if (gldQuote) {
        return {
          price: gldQuote.price * 10,
          sma200: gldQuote.sma200 * 10,
          sma50: gldQuote.sma50 * 10,
        };
      }
      return null;
    }
    
    // For SMAs, still use GLD ETF data scaled up
    const gldQuote = await fetchQuote("GLD");
    return {
      price: goldData.livePrice,
      sma200: gldQuote ? gldQuote.sma200 * 10 : goldData.livePrice,
      sma50: gldQuote ? gldQuote.sma50 * 10 : goldData.livePrice,
    };
  } catch (error) {
    logger.error("api/valuation/expected-returns", "Error fetching gold price", { error });
    // Fallback to GLD ETF * 10
    const gldQuote = await fetchQuote("GLD");
    if (gldQuote) {
      return {
        price: gldQuote.price * 10,
        sma200: gldQuote.sma200 * 10,
        sma50: gldQuote.sma50 * 10,
      };
    }
    return null;
  }
}

async function fetchExpectedReturnsData(): Promise<ExpectedReturnsResponse> {
  const assets: AssetValuation[] = [];

  // Fetch all quote data in parallel
  const [spyData, goldData, btcData, tnxData, vixData, irxData, m2] = await Promise.all([
    fetchQuote("SPY"),
    fetchGoldPrice(),
    fetchQuote("BTC-USD"),
    fetchQuote("^TNX"), // 10Y yield
    fetchQuote("^VIX"), // VIX
    fetchQuote("^IRX"), // 13-week T-bill (proxy for short-term)
    fetchM2(),
  ]);

  // Fetch historical data for RSI calculations
  const [spyHistory, btcHistory] = await Promise.all([
    spyData ? fetchHistoricalData("SPY", 30) : Promise.resolve(null),
    btcData ? fetchHistoricalData("BTC-USD", 30) : Promise.resolve(null),
  ]);

  // Calculate RSIs
  const spyRsi = spyHistory ? calculateRSI(spyHistory.closes) : null;
  const btcRsi = btcHistory ? calculateRSI(btcHistory.closes) : null;

  // VIX level
  const vixLevel = vixData?.price;

  // Yield curve slope (10Y - 2Y approximated by 10Y - 13wk/4)
  // Note: ^IRX is 13-week in percent, rough approximation for short end
  const yieldCurveSlope =
    tnxData && irxData ? tnxData.price - irxData.price : undefined;

  // ---------------------------------------------------------------------------
  // S&P 500
  // ---------------------------------------------------------------------------
  if (spyData) {
    const pe = spyData.pe ?? 30;
    const { valuation, expectedReturn } = calculateSpyValuation(pe);
    const vs200dma = determineTacticalSignal(spyData.price, spyData.sma200);
    const vs50dma = determineTacticalSignal(spyData.price, spyData.sma50);

    const { bias, note } = calculateTacticalBias(
      vs200dma,
      vs50dma,
      spyRsi,
      vixLevel,
      undefined,
      undefined
    );

    const tactical: TacticalOverlay = {
      vs200dma,
      momentum: determineMomentum(vs200dma),
      vs50dma,
      rsi: spyRsi ?? undefined,
      vix: vixLevel,
      bias,
      note,
    };

    assets.push({
      symbol: "SPY",
      name: "S&P 500",
      price: Math.round(spyData.price * 100) / 100,
      valuation,
      expectedReturn,
      tactical,
    });
  }

  // ---------------------------------------------------------------------------
  // Gold
  // ---------------------------------------------------------------------------
  if (goldData && m2) {
    const goldSpot = goldData.price;
    const goldM2Ratio = goldSpot / m2;
    const { valuation, expectedReturn } = calculateGoldValuation(goldM2Ratio);
    const vs200dma = determineTacticalSignal(goldData.price, goldData.sma200);
    const vs50dma = determineTacticalSignal(goldData.price, goldData.sma50);
    const positioning = determineGoldPositioning();

    const { bias, note } = calculateTacticalBias(vs200dma, vs50dma, null, undefined, undefined, undefined);

    const tactical: TacticalOverlay = {
      vs200dma,
      momentum: determineMomentum(vs200dma),
      vs50dma,
      positioning,
      bias,
      note,
    };

    assets.push({
      symbol: "GLD",
      name: "Gold",
      price: Math.round(goldSpot * 100) / 100,
      valuation,
      expectedReturn,
      tactical,
    });
  } else if (goldData) {
    // Fallback without M2
    const goldSpot = goldData.price;
    const vs200dma = determineTacticalSignal(goldData.price, goldData.sma200);
    const vs50dma = determineTacticalSignal(goldData.price, goldData.sma50);

    const { bias, note } = calculateTacticalBias(vs200dma, vs50dma, null, undefined, undefined, undefined);

    assets.push({
      symbol: "GLD",
      name: "Gold",
      price: Math.round(goldSpot * 100) / 100,
      valuation: {
        metric: "Au/M2",
        value: 0,
        percentile: 50,
        zone: "fair",
      },
      expectedReturn: {
        tenYear: 3,
        confidence: "low",
      },
      tactical: {
        vs200dma,
        momentum: determineMomentum(vs200dma),
        vs50dma,
        bias,
        note,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Bitcoin
  // ---------------------------------------------------------------------------
  if (btcData) {
    const cycleYear = getBtcCyclePosition();
    const { valuation, expectedReturn } = calculateBtcValuation(cycleYear);
    const sma200 = btcData.sma200;
    const vs200dma = determineTacticalSignal(btcData.price, sma200);
    const vs50dma = determineTacticalSignal(btcData.price, btcData.sma50);

    const sentiment = determineBtcSentiment(
      btcData.price,
      sma200,
      btcRsi,
      btcData.changePercent ?? null
    );

    const { bias, note } = calculateTacticalBias(
      vs200dma,
      vs50dma,
      btcRsi,
      undefined,
      undefined,
      sentiment
    );

    const tactical: TacticalOverlay = {
      vs200dma,
      momentum: determineMomentum(vs200dma),
      vs50dma,
      rsi: btcRsi ?? undefined,
      sentiment,
      bias,
      note,
    };

    const cycleYearNum = Math.ceil(cycleYear);
    assets.push({
      symbol: "BTC",
      name: "Bitcoin",
      price: Math.round(btcData.price),
      valuation: {
        ...valuation,
        metric: `Halving Yr ${cycleYearNum}/4`,
        // Clear the value to avoid showing "1.9" next to "Halving Yr 2/4"
        value: null as unknown as number,
      },
      expectedReturn,
      tactical,
    });
  }

  // ---------------------------------------------------------------------------
  // Bonds (10Y Treasury)
  // ---------------------------------------------------------------------------
  if (tnxData) {
    const yield10y = tnxData.price;
    const { valuation, expectedReturn } = calculateBondValuation(yield10y);

    const { bias, note } = calculateTacticalBias(
      "at",
      undefined,
      null,
      undefined,
      yieldCurveSlope,
      undefined
    );

    const tactical: TacticalOverlay = {
      vs200dma: "at", // Yields interpreted differently
      momentum: "neutral",
      yieldCurveSlope:
        yieldCurveSlope !== undefined
          ? Math.round(yieldCurveSlope * 100) / 100
          : undefined,
      bias,
      note: yieldCurveSlope !== undefined && yieldCurveSlope < 0 ? "inverted" : note,
    };

    assets.push({
      symbol: "TLT",
      name: "10Y Bonds",
      price: yield10y,
      valuation,
      expectedReturn,
      tactical,
    });
  }

  // Calculate ranking and tactical summary
  const relativeRanking = rankAssetsByExpectedReturn(assets) as AssetSymbol[];
  const tacticalSummary = calculateTacticalSummary(assets);

  return {
    assets,
    relativeRanking,
    tacticalSummary,
    updatedAt: new Date().toISOString(),
    status: assets.length === 4 ? "live" : assets.length > 0 ? "partial" : "error",
  };
}

export async function GET() {
  try {
    // Check cache first
    const cached = await getCache<ExpectedReturnsResponse>(CACHE_KEY, CACHE_MAX_AGE);

    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    // Fetch fresh data
    const data = await fetchExpectedReturnsData();

    // Cache the result
    await setCache(CACHE_KEY, data);

    // If we had stale cache and fetch failed, return stale data
    if (data.status === "error" && cached) {
      return NextResponse.json({
        ...cached.data,
        status: "partial",
        error: "Using cached data due to fetch error",
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    logger.error("api/valuation/expected-returns", "Error in GET", { error });

    // Try to return cached data on error
    const cached = await getCache<ExpectedReturnsResponse>(CACHE_KEY, CACHE_MAX_AGE * 2);
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        status: "partial",
        error: "Using cached data due to error",
      });
    }

    return NextResponse.json(
      {
        assets: [],
        relativeRanking: [],
        tacticalSummary: {
          alignment: "mixed",
          message: "Unable to calculate - data unavailable",
          aligned: [],
          divergent: [],
        },
        updatedAt: new Date().toISOString(),
        status: "error",
        error: "Failed to fetch valuation data",
      },
      { status: 500 }
    );
  }
}
