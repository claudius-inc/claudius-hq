/**
 * Gold Trading Signal API
 * Technical + macro analysis for gold trading decisions
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import {
  calculateRSI,
  getRSISignal,
  calculateMACD,
  calculateSMA,
  calculateATR,
  type OHLCData,
} from "../_lib/technical-indicators";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const API_KEY = process.env.HQ_API_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;

// Request validation
const RequestSchema = z.object({
  detailed: z.boolean().optional().default(false),
  lookbackDays: z.number().optional().default(250),
});

// Auth check
function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// Fetch FRED data
async function fetchFredSeries(seriesId: string): Promise<number | null> {
  if (!FRED_API_KEY) return null;

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.observations?.length || data.observations[0].value === ".") {
      return null;
    }

    return parseFloat(data.observations[0].value);
  } catch (error) {
    logger.warn("api/acp/gold-signal", `FRED fetch failed for ${seriesId}`, { error });
    return null;
  }
}

interface ChartQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}

// Determine signal based on technicals and macro
function determineGoldSignal(
  technicals: {
    rsi: number;
    macdHistogram: number;
    currentPrice: number;
    sma50: number;
    sma200: number;
  },
  macro: {
    realRate: number | null;
    dxy: number | null;
  }
): { signal: "BUY" | "SELL" | "HOLD"; confidence: "HIGH" | "MEDIUM" | "LOW" } {
  let bullPoints = 0;
  let bearPoints = 0;

  // Technical signals
  if (technicals.rsi < 30) bullPoints += 2; // Oversold
  if (technicals.rsi > 70) bearPoints += 2; // Overbought
  if (technicals.macdHistogram > 0) bullPoints += 1;
  if (technicals.macdHistogram < 0) bearPoints += 1;
  if (technicals.currentPrice > technicals.sma50) bullPoints += 1;
  if (technicals.currentPrice > technicals.sma200) bullPoints += 1;
  if (technicals.currentPrice < technicals.sma50) bearPoints += 1;
  if (technicals.currentPrice < technicals.sma200) bearPoints += 1;

  // Macro signals
  if (macro.realRate !== null) {
    if (macro.realRate < 0) bullPoints += 2; // Negative real rates = gold bullish
    if (macro.realRate > 2) bearPoints += 2; // High real rates = gold bearish
  }
  if (macro.dxy !== null) {
    if (macro.dxy < 100) bullPoints += 1; // Weak dollar
    if (macro.dxy > 105) bearPoints += 1; // Strong dollar
  }

  // Geopolitical premium (hardcoded during elevated tension periods)
  bullPoints += 1; // Safe-haven demand

  const netScore = bullPoints - bearPoints;
  let signal: "BUY" | "SELL" | "HOLD";
  if (netScore >= 3) signal = "BUY";
  else if (netScore <= -3) signal = "SELL";
  else signal = "HOLD";

  // Confidence based on score magnitude
  const absScore = Math.abs(netScore);
  let confidence: "HIGH" | "MEDIUM" | "LOW";
  if (absScore >= 5) confidence = "HIGH";
  else if (absScore >= 3) confidence = "MEDIUM";
  else confidence = "LOW";

  return { signal, confidence };
}

// Generate reasoning
function generateGoldReasoning(
  signal: "BUY" | "SELL" | "HOLD",
  technicals: {
    rsi: number;
    macdCrossover: string;
    trend: string;
    momentum: string;
    priceVsSma50: boolean;
    priceVsSma200: boolean;
  },
  macro: {
    realRate: number | null;
    dxy: number | null;
  }
): string {
  const parts: string[] = [];

  // Technical summary
  if (technicals.priceVsSma50 && technicals.priceVsSma200) {
    parts.push("Gold holding above key SMAs");
  } else if (!technicals.priceVsSma50 && !technicals.priceVsSma200) {
    parts.push("Gold trading below key SMAs");
  } else {
    parts.push("Gold mixed vs SMAs");
  }

  // MACD
  if (technicals.macdCrossover === "BULLISH") {
    parts.push(" with bullish MACD crossover");
  } else if (technicals.macdCrossover === "BEARISH") {
    parts.push(" with bearish MACD crossover");
  }

  // Macro
  if (macro.realRate !== null) {
    if (macro.realRate > 0) {
      parts.push(", but positive real rates cap upside");
    } else {
      parts.push(", and negative real rates support prices");
    }
  }

  if (macro.dxy !== null && macro.dxy > 105) {
    parts.push(". Strong USD is a headwind");
  }

  // Action
  if (signal === "BUY") {
    parts.push(". Consider adding to positions.");
  } else if (signal === "SELL") {
    parts.push(". Consider reducing exposure.");
  } else {
    parts.push(". Maintain position, watch for Fed pivot signals.");
  }

  return parts.join("");
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request
    const body = await req.json().catch(() => ({}));
    const { lookbackDays } = RequestSchema.parse(body);

    // Fetch gold price data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    let quotes: ChartQuote[] = [];
    let currentQuote: QuoteResult | null = null;

    try {
      const [chartData, quote] = await Promise.all([
        yahooFinance.chart("GC=F", {
          period1: startDate,
          period2: endDate,
          interval: "1d",
        }) as Promise<{ quotes: ChartQuote[] }>,
        yahooFinance.quote("GC=F") as Promise<QuoteResult>,
      ]);

      quotes = chartData.quotes || [];
      currentQuote = quote;
    } catch (yahooErr) {
      logger.error("api/acp/gold-signal", "Yahoo Finance failed for gold", { error: yahooErr });

      return NextResponse.json(
        {
          error: "Failed to fetch gold price data",
          details: String(yahooErr),
        },
        { status: 503 }
      );
    }

    // Filter valid quotes
    const validQuotes = quotes.filter(
      (q) => q.close !== null && q.high !== null && q.low !== null
    );

    if (validQuotes.length < 50) {
      return NextResponse.json(
        { error: "Insufficient historical data for gold" },
        { status: 503 }
      );
    }

    const closes = validQuotes.map((q) => q.close as number);
    const ohlcData: OHLCData[] = validQuotes.map((q) => ({
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
    }));

    const currentPrice = currentQuote?.regularMarketPrice ?? closes[closes.length - 1];

    // Calculate technical indicators
    const rsi = calculateRSI(closes, 14) ?? 50;
    const rsiSignal = getRSISignal(rsi);
    const macd = calculateMACD(closes);
    const sma50 = calculateSMA(closes, 50) ?? currentPrice;
    const sma200 = calculateSMA(closes, 200) ?? currentPrice;
    const atr = calculateATR(ohlcData, 14) ?? currentPrice * 0.01;

    // Determine trend
    let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (currentPrice > sma50 && currentPrice > sma200 && sma50 > sma200) {
      trend = "BULLISH";
    } else if (currentPrice < sma50 && currentPrice < sma200 && sma50 < sma200) {
      trend = "BEARISH";
    }

    // Determine momentum
    let momentum: "STRONG" | "MODERATE" | "WEAK" = "MODERATE";
    if (macd) {
      if (Math.abs(macd.histogram) > currentPrice * 0.005) momentum = "STRONG";
      else if (Math.abs(macd.histogram) < currentPrice * 0.001) momentum = "WEAK";
    }

    // Fetch macro data from FRED and Yahoo
    const [fedFunds, tenYear, breakeven, dxyQuote] = await Promise.all([
      fetchFredSeries("FEDFUNDS"),
      fetchFredSeries("DGS10"),
      fetchFredSeries("T10YIE"),
      yahooFinance.quote("DX-Y.NYB").catch(() => null) as Promise<QuoteResult | null>,
    ]);

    const dxy = dxyQuote?.regularMarketPrice ?? null;

    // Calculate real rate (Fed Funds - Core CPI, approximated with breakeven)
    let realRate: number | null = null;
    if (fedFunds !== null && breakeven !== null) {
      realRate = Math.round((fedFunds - breakeven) * 100) / 100;
    } else if (fedFunds !== null) {
      // Fallback: assume ~3% inflation
      realRate = Math.round((fedFunds - 3) * 100) / 100;
    }

    // Generate gold bull/bear factors
    const goldBullFactors: string[] = [];
    const goldBearFactors: string[] = [];

    // Price vs SMAs
    if (currentPrice > sma50) goldBullFactors.push("Price above SMA50");
    else goldBearFactors.push("Price below SMA50");

    if (currentPrice > sma200) goldBullFactors.push("Price above SMA200");
    else goldBearFactors.push("Price below SMA200");

    // Real rates
    if (realRate !== null) {
      if (realRate < 0) goldBullFactors.push("Negative real rates");
      else if (realRate > 1) goldBearFactors.push(`Positive real rates (${realRate}%)`);
    }

    // DXY
    if (dxy !== null) {
      if (dxy < 100) goldBullFactors.push("Weak USD (DXY < 100)");
      else if (dxy > 105) goldBearFactors.push("Strong USD (DXY > 105)");
    }

    // Geopolitical
    goldBullFactors.push("Geopolitical uncertainty (safe-haven demand)");
    goldBullFactors.push("Central bank gold accumulation");

    // Determine signal
    const { signal, confidence } = determineGoldSignal(
      {
        rsi,
        macdHistogram: macd?.histogram ?? 0,
        currentPrice,
        sma50,
        sma200,
      },
      { realRate, dxy }
    );

    // Generate reasoning
    const reasoning = generateGoldReasoning(
      signal,
      {
        rsi,
        macdCrossover: macd?.crossover ?? "NONE",
        trend,
        momentum,
        priceVsSma50: currentPrice > sma50,
        priceVsSma200: currentPrice > sma200,
      },
      { realRate, dxy }
    );

    // Calculate price targets
    const targets = {
      upside: Math.round(currentPrice * 1.08 * 100) / 100, // 8% upside target
      downside: Math.round(currentPrice * 0.92 * 100) / 100, // 8% downside target
      stopLoss: Math.round((currentPrice - atr * 2) * 100) / 100,
    };

    // Build response
    const response = {
      signal,
      confidence,

      price: {
        current: Math.round(currentPrice * 100) / 100,
        change24h: Math.round((currentQuote?.regularMarketChange ?? 0) * 100) / 100,
        changePercent24h: Math.round((currentQuote?.regularMarketChangePercent ?? 0) * 100) / 100,
      },

      targets,

      technicals: {
        rsi14: rsi,
        macd: macd
          ? {
              line: macd.macd_line,
              signal: macd.signal_line,
              histogram: macd.histogram,
              crossover: macd.crossover,
            }
          : {
              line: 0,
              signal: 0,
              histogram: 0,
              crossover: "NEUTRAL" as const,
            },
        sma50: Math.round(sma50 * 100) / 100,
        sma200: Math.round(sma200 * 100) / 100,
        trend,
        momentum,
      },

      macro: {
        fedFundsRate: fedFunds,
        dxyIndex: dxy ? Math.round(dxy * 100) / 100 : null,
        realRate,
        tenYearYield: tenYear,
        breakeven10Y: breakeven,
        goldBullFactors,
        goldBearFactors,
      },

      reasoning,

      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request parameters",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    logger.error("api/acp/gold-signal", "Error generating gold signal", { error: String(error) });
    return NextResponse.json(
      {
        error: "Failed to generate gold signal",
        details: String(error),
      },
      { status: 500 }
    );
  }
}

// GET returns documentation
export async function GET() {
  return NextResponse.json({
    name: "Gold Trading Signal API",
    description: "Technical + macro analysis for gold (XAU) with BUY/SELL/HOLD signal",
    endpoint: "POST /api/acp/gold-signal",
    requestSchema: {
      detailed: "boolean (optional, default: false)",
      lookbackDays: "number (optional, default: 250)",
    },
    responseIncludes: [
      "signal (BUY/SELL/HOLD)",
      "confidence (HIGH/MEDIUM/LOW)",
      "price targets (upside, downside, stop loss)",
      "technicals (RSI-14, MACD, SMA50, SMA200)",
      "macro (Fed Funds Rate, DXY, Real Rate, 10Y Yield)",
      "reasoning summary",
    ],
    // dataSources removed per Mr Z request
  });
}
