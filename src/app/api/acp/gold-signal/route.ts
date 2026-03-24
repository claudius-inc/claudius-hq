/**
 * Gold Trading Signal API — Hedge Fund Grade
 * Technical + macro + structural analysis for gold trading decisions
 * 
 * Data Sources:
 * - Yahoo Finance: Gold (GC=F), Silver (SI=F), DXY, VIX, GLD, IAU, TIP
 * - FRED: Fed Funds, 10Y, 2Y, Breakeven, M2
 * - WGC: Central bank buying (quarterly update)
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
  lookbackDays: z.number().optional().default(365),
});

// Auth check
function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// Fetch FRED data with caching info
async function fetchFredSeries(seriesId: string): Promise<{ value: number | null; date: string | null }> {
  if (!FRED_API_KEY) return { value: null, date: null };

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) return { value: null, date: null };

    const data = await res.json();
    if (!data.observations?.length || data.observations[0].value === ".") {
      return { value: null, date: null };
    }

    return {
      value: parseFloat(data.observations[0].value),
      date: data.observations[0].date,
    };
  } catch (error) {
    logger.warn("api/acp/gold-signal", `FRED fetch failed for ${seriesId}`, { error });
    return { value: null, date: null };
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
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
}

// Historical ATH for gold (updated periodically)
const GOLD_ATH = {
  price: 3057.51, // March 2025 ATH
  date: "2025-03-20",
};

// Central Bank buying data (WGC quarterly reports)
// Updated quarterly - last update Q4 2025
const CENTRAL_BANK_DATA = {
  yearlyTonnes: {
    2022: 1082,
    2023: 1037,
    2024: 1045,
    2025: 863, // Q1-Q3 2025 annualized projection
  },
  topBuyers2025: ["China (PBoC)", "Poland", "Turkey", "India", "Czech Republic"],
  trend: "SUSTAINED_BUYING" as const,
  thesis: "Central banks diversifying away from USD reserves; 15th consecutive year of net buying",
  source: "World Gold Council Q3 2025",
};

// Calculate Gold Cycle Position
function calculateCyclePosition(
  currentPrice: number,
  sma200: number,
  ath: number,
  low52w: number
): { phase: string; description: string; percentFromATH: number } {
  const percentFromATH = ((ath - currentPrice) / ath) * 100;
  const rangePosition = ((currentPrice - low52w) / (ath - low52w)) * 100;
  const trendStrength = ((currentPrice - sma200) / sma200) * 100;

  let phase: string;
  let description: string;

  if (percentFromATH < 3 && trendStrength > 0) {
    phase = "BREAKOUT";
    description = "Near ATH, strong momentum — potential new cycle highs";
  } else if (percentFromATH < 10 && trendStrength > 5) {
    phase = "LATE_BULL";
    description = "Mature bull run — watch for momentum divergences";
  } else if (trendStrength > 10) {
    phase = "MID_BULL";
    description = "Strong uptrend with room to run";
  } else if (trendStrength > 0 && trendStrength <= 10) {
    phase = "EARLY_BULL";
    description = "Emerging uptrend — accumulation zone";
  } else if (trendStrength < -10) {
    phase = "BEAR";
    description = "Downtrend — wait for stabilization";
  } else {
    phase = "CONSOLIDATION";
    description = "Range-bound — watch for breakout direction";
  }

  return {
    phase,
    description,
    percentFromATH: Math.round(percentFromATH * 100) / 100,
  };
}

// Advanced signal scoring system
function calculateSignalScore(inputs: {
  rsi: number;
  macdHistogram: number;
  currentPrice: number;
  sma50: number;
  sma200: number;
  realYield: number | null;
  realYield10Y: number | null;
  dxy: number | null;
  vix: number | null;
  goldSilverRatio: number | null;
  yieldCurve: number | null;
  gldVolumeRatio: number | null;
  centralBankTrend: string;
}): { score: number; bullPoints: number; bearPoints: number; factors: { bull: string[]; bear: string[] } } {
  let bullPoints = 0;
  let bearPoints = 0;
  const bullFactors: string[] = [];
  const bearFactors: string[] = [];

  // === TECHNICAL SIGNALS (max 6 points each direction) ===
  
  // RSI
  if (inputs.rsi < 30) {
    bullPoints += 2;
    bullFactors.push(`RSI oversold (${inputs.rsi.toFixed(1)})`);
  } else if (inputs.rsi > 70) {
    bearPoints += 2;
    bearFactors.push(`RSI overbought (${inputs.rsi.toFixed(1)})`);
  }

  // MACD Histogram
  if (inputs.macdHistogram > 0) {
    bullPoints += 1;
    if (inputs.macdHistogram > inputs.currentPrice * 0.005) {
      bullPoints += 1;
      bullFactors.push("Strong bullish MACD momentum");
    }
  } else {
    bearPoints += 1;
    if (inputs.macdHistogram < -inputs.currentPrice * 0.005) {
      bearPoints += 1;
      bearFactors.push("Strong bearish MACD momentum");
    }
  }

  // Price vs SMAs
  if (inputs.currentPrice > inputs.sma50) {
    bullPoints += 1;
    bullFactors.push("Price > SMA50");
  } else {
    bearPoints += 1;
    bearFactors.push("Price < SMA50");
  }

  if (inputs.currentPrice > inputs.sma200) {
    bullPoints += 1;
    bullFactors.push("Price > SMA200 (long-term uptrend)");
  } else {
    bearPoints += 1;
    bearFactors.push("Price < SMA200 (long-term downtrend)");
  }

  // Golden/Death Cross
  if (inputs.sma50 > inputs.sma200) {
    bullPoints += 1;
    bullFactors.push("Golden cross active (SMA50 > SMA200)");
  } else {
    bearPoints += 1;
    bearFactors.push("Death cross active (SMA50 < SMA200)");
  }

  // === MACRO SIGNALS (max 8 points each direction) ===

  // Real Yields (most important for gold)
  if (inputs.realYield10Y !== null) {
    if (inputs.realYield10Y < 0) {
      bullPoints += 3;
      bullFactors.push(`Negative 10Y real yield (${inputs.realYield10Y.toFixed(2)}%) — gold's sweet spot`);
    } else if (inputs.realYield10Y < 1) {
      bullPoints += 1;
      bullFactors.push(`Low 10Y real yield (${inputs.realYield10Y.toFixed(2)}%)`);
    } else if (inputs.realYield10Y > 2) {
      bearPoints += 3;
      bearFactors.push(`High 10Y real yield (${inputs.realYield10Y.toFixed(2)}%) — opportunity cost`);
    } else {
      bearPoints += 1;
      bearFactors.push(`Positive 10Y real yield (${inputs.realYield10Y.toFixed(2)}%)`);
    }
  }

  // DXY (inverse correlation)
  if (inputs.dxy !== null) {
    if (inputs.dxy < 100) {
      bullPoints += 2;
      bullFactors.push(`Weak USD (DXY ${inputs.dxy.toFixed(1)}) — tailwind for gold`);
    } else if (inputs.dxy > 105) {
      bearPoints += 2;
      bearFactors.push(`Strong USD (DXY ${inputs.dxy.toFixed(1)}) — headwind for gold`);
    }
  }

  // VIX (risk sentiment)
  if (inputs.vix !== null) {
    if (inputs.vix > 25) {
      bullPoints += 2;
      bullFactors.push(`Elevated VIX (${inputs.vix.toFixed(1)}) — safe haven demand`);
    } else if (inputs.vix > 20) {
      bullPoints += 1;
      bullFactors.push(`Rising volatility (VIX ${inputs.vix.toFixed(1)})`);
    }
  }

  // Yield Curve (recession indicator)
  if (inputs.yieldCurve !== null) {
    if (inputs.yieldCurve < 0) {
      bullPoints += 1;
      bullFactors.push(`Inverted yield curve (${inputs.yieldCurve.toFixed(2)}%) — recession hedge`);
    }
  }

  // === STRUCTURAL SIGNALS (max 4 points) ===

  // Gold/Silver Ratio
  if (inputs.goldSilverRatio !== null) {
    if (inputs.goldSilverRatio > 85) {
      // Extremely high — either silver catch-up or gold overextended
      bearFactors.push(`Gold/Silver ratio elevated (${inputs.goldSilverRatio.toFixed(1)}) — watch for reversion`);
    } else if (inputs.goldSilverRatio < 70) {
      bullFactors.push(`Gold/Silver ratio healthy (${inputs.goldSilverRatio.toFixed(1)})`);
    }
  }

  // GLD Volume (institutional flows)
  if (inputs.gldVolumeRatio !== null) {
    if (inputs.gldVolumeRatio > 1.5) {
      bullPoints += 1;
      bullFactors.push(`GLD volume surge (${(inputs.gldVolumeRatio * 100 - 100).toFixed(0)}% above avg) — institutional interest`);
    } else if (inputs.gldVolumeRatio < 0.5) {
      bearPoints += 1;
      bearFactors.push("Low GLD volume — waning institutional interest");
    }
  }

  // Central Bank buying (structural)
  if (inputs.centralBankTrend === "SUSTAINED_BUYING") {
    bullPoints += 2;
    bullFactors.push("Central banks net buyers for 15+ years — structural support");
  }

  // Geopolitical premium (persistent since 2022)
  bullPoints += 1;
  bullFactors.push("Geopolitical uncertainty — safe haven bid");

  const score = bullPoints - bearPoints;
  return { score, bullPoints, bearPoints, factors: { bull: bullFactors, bear: bearFactors } };
}

// Determine signal from score
function scoreToSignal(score: number): { signal: "BUY" | "SELL" | "HOLD"; confidence: "HIGH" | "MEDIUM" | "LOW"; conviction: number } {
  const absScore = Math.abs(score);
  
  let signal: "BUY" | "SELL" | "HOLD";
  if (score >= 4) signal = "BUY";
  else if (score <= -4) signal = "SELL";
  else signal = "HOLD";

  let confidence: "HIGH" | "MEDIUM" | "LOW";
  if (absScore >= 8) confidence = "HIGH";
  else if (absScore >= 5) confidence = "MEDIUM";
  else confidence = "LOW";

  // Conviction 0-100 scale
  const conviction = Math.min(100, Math.round((absScore / 12) * 100));

  return { signal, confidence, conviction };
}

// Generate thesis summary
function generateThesis(
  signal: "BUY" | "SELL" | "HOLD",
  factors: { bull: string[]; bear: string[] },
  cyclePhase: string,
  percentFromATH: number
): { bull: string; bear: string; summary: string } {
  const bullThesis = factors.bull.length > 0
    ? `BULL CASE: ${factors.bull.slice(0, 4).join("; ")}`
    : "BULL CASE: Limited bullish catalysts";

  const bearThesis = factors.bear.length > 0
    ? `BEAR CASE: ${factors.bear.slice(0, 4).join("; ")}`
    : "BEAR CASE: Limited bearish headwinds";

  let summary: string;
  if (signal === "BUY") {
    summary = `Gold in ${cyclePhase} phase, ${percentFromATH.toFixed(1)}% from ATH. Bullish factors outweigh bearish. Consider adding on pullbacks.`;
  } else if (signal === "SELL") {
    summary = `Gold in ${cyclePhase} phase, ${percentFromATH.toFixed(1)}% from ATH. Bearish factors dominate. Consider reducing exposure or hedging.`;
  } else {
    summary = `Gold in ${cyclePhase} phase, ${percentFromATH.toFixed(1)}% from ATH. Mixed signals — maintain position, wait for clearer direction.`;
  }

  return { bull: bullThesis, bear: bearThesis, summary };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request
    const body = await req.json().catch(() => ({}));
    const { lookbackDays } = RequestSchema.parse(body);

    // Fetch all market data in parallel
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const [
      goldChart,
      goldQuote,
      silverQuote,
      dxyQuote,
      vixQuote,
      gldQuote,
      iauQuote,
      tipQuote,
    ] = await Promise.all([
      yahooFinance.chart("GC=F", { period1: startDate, period2: endDate, interval: "1d" })
        .catch(() => ({ quotes: [] })) as Promise<{ quotes: ChartQuote[] }>,
      yahooFinance.quote("GC=F").catch(() => null) as Promise<QuoteResult | null>,
      yahooFinance.quote("SI=F").catch(() => null) as Promise<QuoteResult | null>,
      yahooFinance.quote("DX-Y.NYB").catch(() => null) as Promise<QuoteResult | null>,
      yahooFinance.quote("^VIX").catch(() => null) as Promise<QuoteResult | null>,
      yahooFinance.quote("GLD").catch(() => null) as Promise<QuoteResult | null>,
      yahooFinance.quote("IAU").catch(() => null) as Promise<QuoteResult | null>,
      yahooFinance.quote("TIP").catch(() => null) as Promise<QuoteResult | null>,
    ]);

    // Fetch FRED macro data
    const [fedFunds, tenYear, twoYear, breakeven, tips10Y, m2Data] = await Promise.all([
      fetchFredSeries("FEDFUNDS"),
      fetchFredSeries("DGS10"),
      fetchFredSeries("DGS2"),
      fetchFredSeries("T10YIE"),
      fetchFredSeries("DFII10"), // 10Y TIPS real yield
      fetchFredSeries("M2SL"),
    ]);

    // Validate gold data
    const quotes = goldChart.quotes || [];
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

    const currentPrice = goldQuote?.regularMarketPrice ?? closes[closes.length - 1];
    const high52w = goldQuote?.fiftyTwoWeekHigh ?? Math.max(...closes);
    const low52w = goldQuote?.fiftyTwoWeekLow ?? Math.min(...closes);

    // Calculate technical indicators
    const rsi = calculateRSI(closes, 14) ?? 50;
    const rsiSignal = getRSISignal(rsi);
    const macd = calculateMACD(closes);
    const sma20 = calculateSMA(closes, 20) ?? currentPrice;
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

    // === DERIVED METRICS ===

    // Gold/Silver Ratio
    const silverPrice = silverQuote?.regularMarketPrice;
    const goldSilverRatio = silverPrice ? currentPrice / silverPrice : null;

    // DXY
    const dxy = dxyQuote?.regularMarketPrice ?? null;

    // VIX
    const vix = vixQuote?.regularMarketPrice ?? null;

    // GLD Volume Ratio (vs average)
    const gldVolume = gldQuote?.regularMarketVolume;
    const gldAvgVolume = gldQuote?.averageVolume;
    const gldVolumeRatio = (gldVolume && gldAvgVolume && gldAvgVolume > 0)
      ? gldVolume / gldAvgVolume
      : null;

    // IAU Volume Ratio
    const iauVolume = iauQuote?.regularMarketVolume;
    const iauAvgVolume = iauQuote?.averageVolume;
    const iauVolumeRatio = (iauVolume && iauAvgVolume && iauAvgVolume > 0)
      ? iauVolume / iauAvgVolume
      : null;

    // Real Yields
    // 10Y TIPS yield is the direct market-implied real yield
    const realYield10Y = tips10Y.value;
    
    // Fed Funds real rate (Fed Funds - breakeven inflation)
    let realRateFedFunds: number | null = null;
    if (fedFunds.value !== null && breakeven.value !== null) {
      realRateFedFunds = Math.round((fedFunds.value - breakeven.value) * 100) / 100;
    }

    // Yield Curve (10Y - 2Y)
    let yieldCurve: number | null = null;
    if (tenYear.value !== null && twoYear.value !== null) {
      yieldCurve = Math.round((tenYear.value - twoYear.value) * 100) / 100;
    }

    // M2/Gold ratio
    const m2Trillions = m2Data.value ? m2Data.value / 1000 : null;
    const m2GoldRatio = m2Data.value && currentPrice > 0
      ? Math.round((m2Data.value / currentPrice) * 100) / 100
      : null;

    // Cycle Position
    const cyclePosition = calculateCyclePosition(
      currentPrice,
      sma200,
      GOLD_ATH.price,
      low52w
    );

    // === SIGNAL CALCULATION ===
    const scoreResult = calculateSignalScore({
      rsi,
      macdHistogram: macd?.histogram ?? 0,
      currentPrice,
      sma50,
      sma200,
      realYield: realRateFedFunds,
      realYield10Y,
      dxy,
      vix,
      goldSilverRatio,
      yieldCurve,
      gldVolumeRatio,
      centralBankTrend: CENTRAL_BANK_DATA.trend,
    });

    const { signal, confidence, conviction } = scoreToSignal(scoreResult.score);

    // Generate thesis
    const thesis = generateThesis(
      signal,
      scoreResult.factors,
      cyclePosition.phase,
      cyclePosition.percentFromATH
    );

    // Price targets based on ATR and cycle
    const targets = {
      upside: Math.round(currentPrice * 1.08 * 100) / 100,
      resistance: Math.round(Math.min(GOLD_ATH.price, currentPrice * 1.12) * 100) / 100,
      support: Math.round(sma50 * 100) / 100,
      downside: Math.round(currentPrice * 0.92 * 100) / 100,
      stopLoss: Math.round((currentPrice - atr * 2) * 100) / 100,
    };

    // === BUILD RESPONSE ===
    const response = {
      // === SIGNAL ===
      signal,
      confidence,
      conviction, // 0-100 scale
      
      // === THESIS ===
      thesis: {
        summary: thesis.summary,
        bullCase: thesis.bull,
        bearCase: thesis.bear,
      },

      // === PRICE ===
      price: {
        current: Math.round(currentPrice * 100) / 100,
        change24h: Math.round((goldQuote?.regularMarketChange ?? 0) * 100) / 100,
        changePercent24h: Math.round((goldQuote?.regularMarketChangePercent ?? 0) * 100) / 100,
        high52w: Math.round(high52w * 100) / 100,
        low52w: Math.round(low52w * 100) / 100,
        ath: GOLD_ATH.price,
        athDate: GOLD_ATH.date,
        percentFromATH: cyclePosition.percentFromATH,
      },

      // === TARGETS ===
      targets,

      // === CYCLE ANALYSIS ===
      cycle: {
        phase: cyclePosition.phase,
        description: cyclePosition.description,
      },

      // === TECHNICALS ===
      technicals: {
        rsi14: Math.round(rsi * 10) / 10,
        rsiSignal,
        macd: macd ? {
          line: Math.round(macd.macd_line * 100) / 100,
          signal: Math.round(macd.signal_line * 100) / 100,
          histogram: Math.round(macd.histogram * 100) / 100,
          crossover: macd.crossover,
        } : null,
        sma20: Math.round(sma20 * 100) / 100,
        sma50: Math.round(sma50 * 100) / 100,
        sma200: Math.round(sma200 * 100) / 100,
        atr14: Math.round(atr * 100) / 100,
        trend,
      },

      // === MACRO ===
      macro: {
        // Real Yields (gold's primary driver)
        realYield10Y: realYield10Y !== null ? Math.round(realYield10Y * 100) / 100 : null,
        realYieldFedFunds: realRateFedFunds,
        
        // Rates
        fedFundsRate: fedFunds.value,
        tenYearYield: tenYear.value,
        twoYearYield: twoYear.value,
        breakeven10Y: breakeven.value,
        yieldCurve,
        
        // Currency
        dxyIndex: dxy ? Math.round(dxy * 100) / 100 : null,
        
        // Risk Sentiment
        vix: vix ? Math.round(vix * 100) / 100 : null,
        
        // Money Supply
        m2Trillions: m2Trillions ? Math.round(m2Trillions * 100) / 100 : null,
        m2GoldRatio,
      },

      // === PRECIOUS METALS ===
      preciousMetals: {
        goldSilverRatio: goldSilverRatio ? Math.round(goldSilverRatio * 100) / 100 : null,
        goldSilverRatioContext: goldSilverRatio
          ? (goldSilverRatio > 85 ? "Elevated (silver may outperform)" 
             : goldSilverRatio < 70 ? "Low (gold may outperform)"
             : "Normal range")
          : null,
        silverPrice: silverPrice ? Math.round(silverPrice * 100) / 100 : null,
      },

      // === ETF FLOWS ===
      etfFlows: {
        gld: {
          volume: gldVolume ?? null,
          avgVolume: gldAvgVolume ?? null,
          volumeRatio: gldVolumeRatio ? Math.round(gldVolumeRatio * 100) / 100 : null,
          signal: gldVolumeRatio 
            ? (gldVolumeRatio > 1.5 ? "HIGH_INTEREST" : gldVolumeRatio < 0.5 ? "LOW_INTEREST" : "NORMAL")
            : null,
        },
        iau: {
          volume: iauVolume ?? null,
          avgVolume: iauAvgVolume ?? null,
          volumeRatio: iauVolumeRatio ? Math.round(iauVolumeRatio * 100) / 100 : null,
        },
      },

      // === STRUCTURAL ===
      structural: {
        centralBanks: {
          tonnes2024: CENTRAL_BANK_DATA.yearlyTonnes[2024],
          tonnes2025YTD: CENTRAL_BANK_DATA.yearlyTonnes[2025],
          topBuyers: CENTRAL_BANK_DATA.topBuyers2025,
          trend: CENTRAL_BANK_DATA.trend,
          thesis: CENTRAL_BANK_DATA.thesis,
        },
      },

      // === SCORING BREAKDOWN ===
      scoring: {
        netScore: scoreResult.score,
        bullPoints: scoreResult.bullPoints,
        bearPoints: scoreResult.bearPoints,
        bullFactors: scoreResult.factors.bull,
        bearFactors: scoreResult.factors.bear,
      },

      // === META ===
      timestamp: new Date().toISOString(),
      dataAsOf: {
        fred: fedFunds.date || tenYear.date || "unknown",
      },
      processingTimeMs: Date.now() - startTime,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request parameters", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("api/acp/gold-signal", "Error generating gold signal", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate gold signal", details: String(error) },
      { status: 500 }
    );
  }
}

// GET returns documentation
export async function GET() {
  return NextResponse.json({
    name: "Gold Trading Signal API — Hedge Fund Grade",
    description: "Comprehensive gold (XAU) analysis combining technicals, macro, and structural factors",
    version: "2.0",
    endpoint: "POST /api/acp/gold-signal",
    requestSchema: {
      lookbackDays: "number (optional, default: 365)",
    },
    responseIncludes: [
      "signal (BUY/SELL/HOLD) with confidence and conviction score",
      "thesis (bull case, bear case, summary)",
      "price (current, change, ATH, 52w range)",
      "cycle (phase and description)",
      "technicals (RSI, MACD, SMAs, ATR, trend)",
      "macro (real yields, Fed Funds, 10Y/2Y, yield curve, DXY, VIX, M2)",
      "precious metals (gold/silver ratio with context)",
      "ETF flows (GLD/IAU volume vs average)",
      "structural (central bank buying trends)",
      "scoring breakdown (bull/bear points and factors)",
    ],
    features: [
      "10Y TIPS real yield — direct market-implied real rate",
      "Gold/silver ratio analysis with historical context",
      "GLD/IAU volume analysis for institutional flow signals",
      "Cycle position detection (breakout, bull, bear, consolidation)",
      "ATH tracking with distance calculation",
      "Yield curve (10Y-2Y) for recession indicator",
      "VIX integration for risk sentiment",
      "Central bank buying context (WGC data)",
      "Multi-factor scoring with transparent breakdown",
    ],
  });
}
