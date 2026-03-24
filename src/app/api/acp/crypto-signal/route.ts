/**
 * Crypto Trading Signal API
 * Supports BTC, ETH, SOL, HYPE with technical analysis
 * 
 * BTC-specific enhancements:
 * - Halving cycle context (days since halving, historical patterns)
 * - Funding rates from perpetual futures
 * - On-chain metrics (exchange balances, hash rate)
 * - Multi-timeframe confluence scoring
 * - Enhanced confidence scoring
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import {
  calculateRSI,
  getRSISignal,
  calculateMACD,
  calculateSMAs,
  calculateBollingerBands,
  calculateATR,
  analyzeVolume,
  calculateSignal,
  calculatePriceTargets,
  generateReasoning,
  determineTrend,
  type OHLCData,
} from "../_lib/technical-indicators";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ===== BTC HALVING DATA =====
const BTC_HALVINGS = [
  { block: 210000, date: new Date("2012-11-28"), reward: 25 },
  { block: 420000, date: new Date("2016-07-09"), reward: 12.5 },
  { block: 630000, date: new Date("2020-05-11"), reward: 6.25 },
  { block: 840000, date: new Date("2024-04-20"), reward: 3.125 },
];

const HALVING_CYCLE_PATTERNS = {
  // Days after halving → typical market phase
  phases: [
    { start: 0, end: 90, phase: "POST_HALVING_ACCUMULATION", bullish_bias: 0.55 },
    { start: 91, end: 365, phase: "EARLY_BULL", bullish_bias: 0.70 },
    { start: 366, end: 548, phase: "PARABOLIC_PHASE", bullish_bias: 0.80 },
    { start: 549, end: 730, phase: "CYCLE_TOP_ZONE", bullish_bias: 0.45 },
    { start: 731, end: 1095, phase: "BEAR_MARKET", bullish_bias: 0.30 },
    { start: 1096, end: 1460, phase: "PRE_HALVING_ACCUMULATION", bullish_bias: 0.60 },
  ],
  // Historical cycle performance (ATH vs halving price)
  historicalMultiples: {
    "2012": { halvingPrice: 12, cycleATH: 1100, multiple: 91.7 },
    "2016": { halvingPrice: 650, cycleATH: 20000, multiple: 30.8 },
    "2020": { halvingPrice: 8600, cycleATH: 69000, multiple: 8.0 },
    "2024": { halvingPrice: 63000, avgMultiple: 5.5 }, // Conservative estimate
  },
};

interface HalvingContext {
  days_since_halving: number;
  halving_date: string;
  current_block_reward: number;
  next_halving_estimate: string;
  cycle_phase: string;
  cycle_bullish_bias: number;
  historical_note: string;
}

const API_KEY = process.env.HQ_API_KEY;

// ===== BTC-SPECIFIC DATA FETCHERS =====

function getHalvingContext(): HalvingContext {
  const now = new Date();
  const lastHalving = BTC_HALVINGS[BTC_HALVINGS.length - 1];
  const daysSinceHalving = Math.floor(
    (now.getTime() - lastHalving.date.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Find current cycle phase
  const currentPhase = HALVING_CYCLE_PATTERNS.phases.find(
    (p) => daysSinceHalving >= p.start && daysSinceHalving <= p.end
  ) || HALVING_CYCLE_PATTERNS.phases[HALVING_CYCLE_PATTERNS.phases.length - 1];

  // Estimate next halving (~4 years after last)
  const nextHalvingDate = new Date(lastHalving.date);
  nextHalvingDate.setFullYear(nextHalvingDate.getFullYear() + 4);

  // Historical context
  let historicalNote = "";
  if (daysSinceHalving < 365) {
    historicalNote = "First year post-halving historically sees accumulation followed by early bull momentum. Previous cycles saw 2-3x gains in this phase.";
  } else if (daysSinceHalving < 548) {
    historicalNote = "12-18 months post-halving historically marks the beginning of parabolic moves. 2012 and 2016 cycles peaked ~18 months after halving.";
  } else if (daysSinceHalving < 730) {
    historicalNote = "18-24 months post-halving is historically the cycle top zone. Exercise caution and consider profit-taking strategies.";
  } else {
    historicalNote = "Late cycle phase. Historically, this period sees consolidation or bear market before next halving accumulation begins.";
  }

  return {
    days_since_halving: daysSinceHalving,
    halving_date: lastHalving.date.toISOString().split("T")[0],
    current_block_reward: lastHalving.reward,
    next_halving_estimate: nextHalvingDate.toISOString().split("T")[0],
    cycle_phase: currentPhase.phase,
    cycle_bullish_bias: currentPhase.bullish_bias,
    historical_note: historicalNote,
  };
}

interface FundingRateData {
  rate: number;
  rate_annualized: number;
  sentiment: "EXTREME_LONG" | "LONG_BIAS" | "NEUTRAL" | "SHORT_BIAS" | "EXTREME_SHORT";
  interpretation: string;
}

async function fetchBinanceFundingRate(symbol: string = "BTCUSDT"): Promise<FundingRateData | null> {
  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data || data.length === 0) return null;
    
    const rate = parseFloat(data[0].fundingRate);
    const rateAnnualized = rate * 3 * 365 * 100; // 3 funding periods per day
    
    // Sentiment interpretation
    let sentiment: FundingRateData["sentiment"];
    let interpretation: string;
    
    if (rate > 0.001) {
      sentiment = "EXTREME_LONG";
      interpretation = "Extremely high funding rate suggests overleveraged longs. Historically precedes corrections.";
    } else if (rate > 0.0003) {
      sentiment = "LONG_BIAS";
      interpretation = "Positive funding indicates more longs than shorts. Bulls paying to hold positions.";
    } else if (rate < -0.001) {
      sentiment = "EXTREME_SHORT";
      interpretation = "Negative funding suggests crowded short positions. Short squeeze potential.";
    } else if (rate < -0.0003) {
      sentiment = "SHORT_BIAS";
      interpretation = "Slightly negative funding indicates bearish sentiment in derivatives.";
    } else {
      sentiment = "NEUTRAL";
      interpretation = "Funding near neutral. No extreme positioning in either direction.";
    }
    
    return {
      rate: Math.round(rate * 10000) / 10000, // 4 decimal precision
      rate_annualized: Math.round(rateAnnualized * 100) / 100,
      sentiment,
      interpretation,
    };
  } catch (e) {
    logger.warn("api/acp/crypto-signal", "Failed to fetch funding rate", { error: e });
    return null;
  }
}

interface OnChainMetrics {
  exchange_balance_trend: "INFLOW" | "OUTFLOW" | "STABLE" | null;
  hash_rate_trend: "INCREASING" | "DECREASING" | "STABLE" | null;
  active_addresses_24h: number | null;
  interpretation: string[];
}

async function fetchOnChainMetrics(): Promise<OnChainMetrics> {
  const interpretation: string[] = [];
  let exchangeBalanceTrend: OnChainMetrics["exchange_balance_trend"] = null;
  let hashRateTrend: OnChainMetrics["hash_rate_trend"] = null;
  let activeAddresses: number | null = null;
  
  try {
    // Fetch hash rate from blockchain.com (free, no auth)
    const hashRateRes = await fetch(
      "https://api.blockchain.info/charts/hash-rate?timespan=30days&format=json",
      { cache: "no-store" }
    );
    
    if (hashRateRes.ok) {
      const hashData = await hashRateRes.json();
      if (hashData.values && hashData.values.length >= 7) {
        const recent = hashData.values.slice(-7);
        const older = hashData.values.slice(-14, -7);
        const recentAvg = recent.reduce((a: number, b: { y: number }) => a + b.y, 0) / recent.length;
        const olderAvg = older.reduce((a: number, b: { y: number }) => a + b.y, 0) / older.length;
        
        if (recentAvg > olderAvg * 1.05) {
          hashRateTrend = "INCREASING";
          interpretation.push("Hash rate increasing: miners confident, network security strengthening");
        } else if (recentAvg < olderAvg * 0.95) {
          hashRateTrend = "DECREASING";
          interpretation.push("Hash rate declining: potential miner capitulation or difficulty adjustment");
        } else {
          hashRateTrend = "STABLE";
          interpretation.push("Hash rate stable: network operating normally");
        }
      }
    }
  } catch (e) {
    logger.warn("api/acp/crypto-signal", "Failed to fetch hash rate", { error: e });
  }
  
  try {
    // Fetch active addresses (24h unique addresses)
    const addrRes = await fetch(
      "https://api.blockchain.info/charts/n-unique-addresses?timespan=7days&format=json",
      { cache: "no-store" }
    );
    
    if (addrRes.ok) {
      const addrData = await addrRes.json();
      if (addrData.values && addrData.values.length > 0) {
        const latest = addrData.values[addrData.values.length - 1];
        activeAddresses = Math.round(latest.y);
        
        // Context: 800k-1M is healthy, >1M is high activity
        if (activeAddresses > 1000000) {
          interpretation.push("High on-chain activity (>1M addresses): increased network usage");
        } else if (activeAddresses > 800000) {
          interpretation.push("Healthy on-chain activity: normal network engagement");
        } else if (activeAddresses < 600000) {
          interpretation.push("Low on-chain activity: reduced network usage, possible consolidation");
        }
      }
    }
  } catch (e) {
    logger.warn("api/acp/crypto-signal", "Failed to fetch active addresses", { error: e });
  }
  
  // Note: Exchange balance requires paid APIs (Glassnode/CryptoQuant)
  // We'll indicate this limitation
  interpretation.push("Exchange flow data requires premium on-chain APIs (Glassnode/CryptoQuant)");
  
  return {
    exchange_balance_trend: exchangeBalanceTrend,
    hash_rate_trend: hashRateTrend,
    active_addresses_24h: activeAddresses,
    interpretation,
  };
}

interface FearGreedExtended {
  value: number;
  label: string;
  trend_7d: "IMPROVING" | "DETERIORATING" | "STABLE";
  historical_values: { value: number; date: string }[];
  contrarian_signal: string | null;
}

async function fetchFearGreedExtended(): Promise<FearGreedExtended | null> {
  try {
    // Fetch 7 days of data for trend analysis
    const res = await fetch("https://api.alternative.me/fng/?limit=7", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    
    const values = data.data.map((d: { value: string; timestamp: string }) => ({
      value: parseInt(d.value),
      date: new Date(parseInt(d.timestamp) * 1000).toISOString().split("T")[0],
    }));
    
    const currentValue = values[0].value;
    const oldestValue = values[values.length - 1]?.value || currentValue;
    
    // Determine trend
    let trend: FearGreedExtended["trend_7d"];
    if (currentValue > oldestValue + 10) trend = "IMPROVING";
    else if (currentValue < oldestValue - 10) trend = "DETERIORATING";
    else trend = "STABLE";
    
    // Label
    let label = "Neutral";
    if (currentValue <= 25) label = "Extreme Fear";
    else if (currentValue <= 45) label = "Fear";
    else if (currentValue <= 55) label = "Neutral";
    else if (currentValue <= 75) label = "Greed";
    else label = "Extreme Greed";
    
    // Contrarian signal
    let contrarianSignal: string | null = null;
    if (currentValue <= 20) {
      contrarianSignal = "CONTRARIAN_BUY: Extreme fear historically marks local bottoms";
    } else if (currentValue >= 80) {
      contrarianSignal = "CONTRARIAN_SELL: Extreme greed historically precedes corrections";
    } else if (currentValue <= 30 && trend === "DETERIORATING") {
      contrarianSignal = "POTENTIAL_CAPITULATION: Fear increasing, watch for reversal signals";
    }
    
    return {
      value: currentValue,
      label,
      trend_7d: trend,
      historical_values: values.slice(0, 7),
      contrarian_signal: contrarianSignal,
    };
  } catch {
    return null;
  }
}

// Asset configuration
const ASSET_CONFIG = {
  BTC: {
    name: "Bitcoin",
    yahooSymbol: "BTC-USD",
    coingeckoId: "bitcoin",
    binanceSymbol: "BTCUSDT",
  },
  ETH: {
    name: "Ethereum",
    yahooSymbol: "ETH-USD",
    coingeckoId: "ethereum",
    binanceSymbol: "ETHUSDT",
  },
  SOL: {
    name: "Solana",
    yahooSymbol: "SOL-USD",
    coingeckoId: "solana",
    binanceSymbol: "SOLUSDT",
  },
  HYPE: {
    name: "Hyperliquid",
    yahooSymbol: "HYPE-USD",
    coingeckoId: "hyperliquid",
    binanceSymbol: null, // Not on Binance
  },
} as const;

type AssetKey = keyof typeof ASSET_CONFIG;

// Request validation (case-insensitive asset)
const RequestSchema = z.object({
  asset: z.string().transform(s => s.toUpperCase()).pipe(z.enum(["BTC", "ETH", "SOL", "HYPE"])),
  timeframe: z.enum(["4h", "daily", "weekly"]).default("daily"),
});

// Cache TTLs by timeframe (seconds)
const CACHE_TTL = {
  "4h": 15 * 60,
  daily: 30 * 60,
  weekly: 60 * 60,
} as const;

// Auth check
function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// Get interval and period based on timeframe
function getChartParams(timeframe: string): { interval: "1h" | "1d" | "1wk"; days: number } {
  switch (timeframe) {
    case "4h":
      return { interval: "1h", days: 60 };
    case "weekly":
      return { interval: "1wk", days: 400 };
    default:
      return { interval: "1d", days: 250 };
  }
}

// Simple Fear & Greed (kept for non-BTC assets)
async function fetchFearGreedIndex(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const value = parseInt(data.data?.[0]?.value ?? "50");
    let label = "Neutral";
    if (value <= 25) label = "Extreme Fear";
    else if (value <= 45) label = "Fear";
    else if (value <= 55) label = "Neutral";
    else if (value <= 75) label = "Greed";
    else label = "Extreme Greed";
    return { value, label };
  } catch {
    return null;
  }
}

// ===== ENHANCED CONFIDENCE SCORING FOR BTC =====
interface EnhancedSignalResult {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  strength: "STRONG" | "MODERATE" | "WEAK";
  factor_breakdown: {
    technical_score: number;
    sentiment_score: number;
    cycle_score: number;
    funding_score: number;
    total_bullish: number;
    total_bearish: number;
  };
}

function calculateEnhancedBTCSignal(
  technicalFactors: {
    rsiSignal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
    macdCrossover: "BULLISH" | "BEARISH" | "NONE";
    priceVsSma: { sma20: boolean; sma50: boolean; sma200: boolean };
    volumeTrend: "INCREASING" | "DECREASING" | "STABLE";
    bollingerPosition: string;
    trend: "BULLISH" | "BEARISH" | "NEUTRAL";
    mayerMultiple?: number;
  },
  fearGreed: FearGreedExtended | null,
  halvingContext: HalvingContext,
  fundingRate: FundingRateData | null,
  onChain: OnChainMetrics
): EnhancedSignalResult {
  let technicalBullish = 0;
  let technicalBearish = 0;
  let sentimentBullish = 0;
  let sentimentBearish = 0;
  
  // === TECHNICAL FACTORS (max 30 points) ===
  
  // RSI (0-5 points)
  if (technicalFactors.rsiSignal === "OVERSOLD") technicalBullish += 5;
  else if (technicalFactors.rsiSignal === "OVERBOUGHT") technicalBearish += 5;
  else technicalBullish += 2; // Neutral is slightly bullish in uptrends
  
  // MACD (0-5 points)
  if (technicalFactors.macdCrossover === "BULLISH") technicalBullish += 5;
  else if (technicalFactors.macdCrossover === "BEARISH") technicalBearish += 5;
  
  // Price vs SMAs (0-9 points, 3 each)
  if (technicalFactors.priceVsSma.sma20) technicalBullish += 3; else technicalBearish += 3;
  if (technicalFactors.priceVsSma.sma50) technicalBullish += 3; else technicalBearish += 3;
  if (technicalFactors.priceVsSma.sma200) technicalBullish += 3; else technicalBearish += 3;
  
  // Volume confirmation (0-3 points)
  if (technicalFactors.volumeTrend === "INCREASING") {
    if (technicalFactors.trend === "BULLISH") technicalBullish += 3;
    else if (technicalFactors.trend === "BEARISH") technicalBearish += 3;
  }
  
  // Bollinger position (0-3 points)
  if (technicalFactors.bollingerPosition === "BELOW_LOWER") technicalBullish += 3;
  else if (technicalFactors.bollingerPosition === "ABOVE_UPPER") technicalBearish += 3;
  
  // Mayer Multiple (0-5 points) - BTC specific
  if (technicalFactors.mayerMultiple !== undefined) {
    if (technicalFactors.mayerMultiple < 0.8) technicalBullish += 5; // Undervalued
    else if (technicalFactors.mayerMultiple < 1.0) technicalBullish += 3; // Accumulation
    else if (technicalFactors.mayerMultiple > 2.4) technicalBearish += 5; // Overheated
    else if (technicalFactors.mayerMultiple > 1.8) technicalBearish += 2; // Elevated
  }
  
  // === SENTIMENT FACTORS (max 20 points) ===
  
  // Fear & Greed (0-8 points, contrarian)
  if (fearGreed) {
    if (fearGreed.value <= 20) sentimentBullish += 8; // Extreme fear = buy signal
    else if (fearGreed.value <= 35) sentimentBullish += 4;
    else if (fearGreed.value >= 80) sentimentBearish += 8; // Extreme greed = sell signal
    else if (fearGreed.value >= 65) sentimentBearish += 4;
    
    // Trend adds weight
    if (fearGreed.trend_7d === "IMPROVING" && fearGreed.value < 50) sentimentBullish += 2;
    if (fearGreed.trend_7d === "DETERIORATING" && fearGreed.value > 50) sentimentBearish += 2;
  }
  
  // Funding rate (0-6 points, contrarian)
  if (fundingRate) {
    if (fundingRate.sentiment === "EXTREME_LONG") sentimentBearish += 6; // Overleveraged longs
    else if (fundingRate.sentiment === "LONG_BIAS") sentimentBearish += 2;
    else if (fundingRate.sentiment === "EXTREME_SHORT") sentimentBullish += 6; // Short squeeze potential
    else if (fundingRate.sentiment === "SHORT_BIAS") sentimentBullish += 2;
  }
  
  // On-chain (0-4 points)
  if (onChain.hash_rate_trend === "INCREASING") sentimentBullish += 2;
  else if (onChain.hash_rate_trend === "DECREASING") sentimentBearish += 2;
  
  if (onChain.active_addresses_24h) {
    if (onChain.active_addresses_24h > 1000000) sentimentBullish += 2;
    else if (onChain.active_addresses_24h < 600000) sentimentBearish += 2;
  }
  
  // === CYCLE FACTORS (max 10 points) ===
  let cycleScore = 0;
  
  // Halving cycle bias
  const cycleBias = halvingContext.cycle_bullish_bias;
  if (cycleBias >= 0.7) {
    cycleScore = 8; // Strong bullish cycle phase
    sentimentBullish += 8;
  } else if (cycleBias >= 0.55) {
    cycleScore = 4;
    sentimentBullish += 4;
  } else if (cycleBias <= 0.35) {
    cycleScore = -6;
    sentimentBearish += 6;
  } else if (cycleBias <= 0.45) {
    cycleScore = -3;
    sentimentBearish += 3;
  }
  
  // === CALCULATE FINAL SIGNAL ===
  const totalBullish = technicalBullish + sentimentBullish;
  const totalBearish = technicalBearish + sentimentBearish;
  const netScore = totalBullish - totalBearish;
  const maxPossible = 60; // Max points either direction
  
  // Action determination with clearer thresholds
  let action: "BUY" | "SELL" | "HOLD";
  if (netScore >= 12) action = "BUY";
  else if (netScore <= -12) action = "SELL";
  else action = "HOLD";
  
  // Confidence = strength of conviction (how one-sided the indicators are)
  const dominantScore = Math.max(totalBullish, totalBearish);
  const rawConfidence = (dominantScore / maxPossible) * 100;
  
  // Adjust confidence by agreement (if both sides have points, lower confidence)
  const oppositionPenalty = Math.min(totalBullish, totalBearish) * 1.5;
  const confidence = Math.max(20, Math.min(95, Math.round(rawConfidence - oppositionPenalty)));
  
  // Strength classification
  let strength: "STRONG" | "MODERATE" | "WEAK";
  if (confidence >= 70 && Math.abs(netScore) >= 15) strength = "STRONG";
  else if (confidence >= 50 && Math.abs(netScore) >= 8) strength = "MODERATE";
  else strength = "WEAK";
  
  return {
    action,
    confidence,
    strength,
    factor_breakdown: {
      technical_score: technicalBullish - technicalBearish,
      sentiment_score: sentimentBullish - sentimentBearish,
      cycle_score: cycleScore,
      funding_score: fundingRate ? (fundingRate.sentiment.includes("SHORT") ? 2 : fundingRate.sentiment.includes("LONG") ? -2 : 0) : 0,
      total_bullish: totalBullish,
      total_bearish: totalBearish,
    },
  };
}

// Fetch BTC dominance from CoinGecko
async function fetchBTCDominance(): Promise<number | null> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.market_cap_percentage?.btc ?? null;
  } catch {
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
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
}

export async function POST(req: NextRequest) {
  const requestId = `sig_${Date.now().toString(36)}`;
  const startTime = Date.now();

  try {
    // Parse & validate request
    const body = await req.json();
    const parsed = RequestSchema.parse(body);
    const asset = parsed.asset as AssetKey;
    const timeframe = parsed.timeframe as keyof typeof CACHE_TTL;

    const config = ASSET_CONFIG[asset];
    const { interval, days } = getChartParams(timeframe);

    // Fetch price data from Yahoo Finance
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let quotes: ChartQuote[] = [];
    let currentQuote: QuoteResult | null = null;

    try {
      const [chartData, quote] = await Promise.all([
        yahooFinance.chart(config.yahooSymbol, {
          period1: startDate,
          period2: endDate,
          interval,
        }) as Promise<{ quotes: ChartQuote[] }>,
        yahooFinance.quote(config.yahooSymbol) as Promise<QuoteResult>,
      ]);

      quotes = chartData.quotes || [];
      currentQuote = quote;
      
      // If Yahoo returned empty data, fall back to CoinGecko
      if (quotes.length === 0) {
        throw new Error("Yahoo returned empty data");
      }
    } catch (yahooErr) {
      logger.warn("api/acp/crypto-signal", `Yahoo Finance failed for ${asset}`, { error: yahooErr });
      
      // Fallback to CoinGecko
      try {
        // Fetch both price history and current market data
        const [chartRes, coinRes] = await Promise.all([
          fetch(
            `https://api.coingecko.com/api/v3/coins/${config.coingeckoId}/market_chart?vs_currency=usd&days=${days}`,
            { cache: "no-store" }
          ),
          fetch(
            `https://api.coingecko.com/api/v3/coins/${config.coingeckoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
            { cache: "no-store" }
          ),
        ]);

        if (chartRes.ok) {
          const cgData = await chartRes.json();
          quotes = cgData.prices.map((p: [number, number]) => ({
            date: new Date(p[0]),
            close: p[1],
            high: p[1],
            low: p[1],
            open: p[1],
            volume: 0,
          }));
        }

        if (coinRes.ok) {
          const coinData = await coinRes.json();
          // Create a pseudo QuoteResult from CoinGecko data
          currentQuote = {
            regularMarketPrice: coinData.market_data?.current_price?.usd ?? 0,
            regularMarketChangePercent: coinData.market_data?.price_change_percentage_24h ?? 0,
            regularMarketVolume: coinData.market_data?.total_volume?.usd ?? 0,
            marketCap: coinData.market_data?.market_cap?.usd ?? 0,
          } as QuoteResult;
        }
      } catch (cgErr) {
        logger.warn("api/acp/crypto-signal", `CoinGecko fallback failed for ${asset}`, { error: cgErr });
        
        // Third fallback: Binance (unlimited, no rate limit)
        if (config.binanceSymbol) {
          try {
            const [klineRes, tickerRes] = await Promise.all([
              fetch(`https://api.binance.com/api/v3/klines?symbol=${config.binanceSymbol}&interval=1d&limit=${days}`),
              fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${config.binanceSymbol}`),
            ]);

            if (klineRes.ok) {
              const klines = await klineRes.json();
              quotes = klines.map((k: string[]) => ({
                date: new Date(Number(k[0])),
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5]),
              }));
            }

            if (tickerRes.ok) {
              const ticker = await tickerRes.json();
              currentQuote = {
                regularMarketPrice: parseFloat(ticker.lastPrice),
                regularMarketChangePercent: parseFloat(ticker.priceChangePercent),
                regularMarketVolume: parseFloat(ticker.volume) * parseFloat(ticker.lastPrice),
                marketCap: 0, // Binance doesn't provide market cap
              } as QuoteResult;
            }

            logger.info("api/acp/crypto-signal", `Using Binance fallback for ${asset}`);
          } catch (binanceErr) {
            logger.error("api/acp/crypto-signal", `All sources failed for ${asset}`, { error: binanceErr });
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "DATA_UNAVAILABLE",
                  message: `Failed to fetch price data for ${asset}`,
                },
                meta: { request_id: requestId },
              },
              { status: 503 }
            );
          }
        } else {
          // No Binance symbol available (HYPE)
          logger.error("api/acp/crypto-signal", `All sources failed for ${asset} (no Binance)`, { error: cgErr });
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "DATA_UNAVAILABLE",
                message: `Failed to fetch price data for ${asset}`,
              },
              meta: { request_id: requestId },
            },
            { status: 503 }
          );
        }
      }
    }

    // Filter valid quotes
    const validQuotes = quotes.filter(
      (q) => q.close !== null && q.high !== null && q.low !== null
    );

    if (validQuotes.length < 5) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DATA_UNAVAILABLE",
            message: `Insufficient historical data for ${asset} (got ${validQuotes.length} points, need 5+)`,
          },
          meta: { request_id: requestId },
        },
        { status: 503 }
      );
    }

    const closes = validQuotes.map((q) => q.close as number);
    const volumes = validQuotes.map((q) => q.volume ?? 0);
    const ohlcData: OHLCData[] = validQuotes.map((q) => ({
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
    }));

    const currentPrice = closes[closes.length - 1];

    // Calculate technical indicators
    const rsi = calculateRSI(closes, 14) ?? 50;
    const rsiSignal = getRSISignal(rsi);
    const macd = calculateMACD(closes) ?? {
      macd_line: 0,
      signal_line: 0,
      histogram: 0,
      crossover: "NONE" as const,
    };
    const smas = calculateSMAs(closes);
    const bollinger = calculateBollingerBands(closes);
    const atr = calculateATR(ohlcData) ?? currentPrice * 0.03;
    const volume = analyzeVolume(volumes);

    // Fetch market context - BTC gets enhanced data
    const isBTC = asset === "BTC";
    
    const [
      fearGreed,
      btcDominance,
      fearGreedExtended,
      fundingRate,
      onChainMetrics,
    ] = await Promise.all([
      fetchFearGreedIndex(),
      fetchBTCDominance(),
      isBTC ? fetchFearGreedExtended() : Promise.resolve(null),
      isBTC ? fetchBinanceFundingRate("BTCUSDT") : Promise.resolve(null),
      isBTC ? fetchOnChainMetrics() : Promise.resolve({ exchange_balance_trend: null, hash_rate_trend: null, active_addresses_24h: null, interpretation: [] }),
    ]);
    
    // BTC-specific: Get halving context
    const halvingContext = isBTC ? getHalvingContext() : null;

    // Calculate Mayer Multiple for BTC (price / 200-day SMA) - must be before signal calculation
    let mayerMultiple: number | null = null;
    let mayerZone: string | null = null;
    if (asset === "BTC" && smas && smas.sma_200 > 0) {
      mayerMultiple = Math.round((currentPrice / smas.sma_200) * 100) / 100;
      if (mayerMultiple < 0.8) mayerZone = "UNDERVALUED";
      else if (mayerMultiple < 1.0) mayerZone = "ACCUMULATION";
      else if (mayerMultiple < 1.4) mayerZone = "FAIR_VALUE";
      else if (mayerMultiple < 2.4) mayerZone = "ELEVATED";
      else mayerZone = "OVERHEATED";
    }
    
    // Calculate signal - use enhanced scoring for BTC
    const signalFactors = {
      rsiSignal,
      macdCrossover: macd.crossover,
      priceVsSma: {
        sma20: smas ? currentPrice > smas.sma_20 : true,
        sma50: smas ? currentPrice > smas.sma_50 : true,
        sma200: smas ? currentPrice > smas.sma_200 : true,
      },
      volumeTrend: volume?.trend ?? "STABLE",
      bollingerPosition: bollinger?.position ?? "MIDDLE",
      fearGreedIndex: fearGreed?.value,
    };

    // BTC gets enhanced multi-factor scoring
    let signal;
    let factorBreakdown = null;
    
    if (isBTC && halvingContext && fearGreedExtended) {
      const enhancedSignal = calculateEnhancedBTCSignal(
        {
          ...signalFactors,
          trend: smas ? determineTrend(rsi, macd, smas, currentPrice) : "NEUTRAL",
          mayerMultiple: mayerMultiple ?? undefined,
        },
        fearGreedExtended,
        halvingContext,
        fundingRate,
        onChainMetrics
      );
      signal = {
        action: enhancedSignal.action,
        confidence: enhancedSignal.confidence,
        strength: enhancedSignal.strength,
      };
      factorBreakdown = enhancedSignal.factor_breakdown;
    } else {
      signal = calculateSignal(signalFactors);
    }

    // Calculate targets
    const targets = calculatePriceTargets(
      currentPrice,
      bollinger ?? {
        upper: currentPrice * 1.05,
        middle: currentPrice,
        lower: currentPrice * 0.95,
        position: "MIDDLE",
        squeeze: false,
      },
      smas ?? {
        sma_20: currentPrice,
        sma_50: currentPrice * 0.98,
        sma_200: currentPrice * 0.90,
        price_vs_sma_20: "ABOVE",
        price_vs_sma_50: "ABOVE",
        price_vs_sma_200: "ABOVE",
        golden_cross: true,
        death_cross: false,
      },
      atr
    );

    // Calculate trend
    const trend = smas
      ? determineTrend(rsi, macd, smas, currentPrice)
      : "NEUTRAL";

    // Generate reasoning
    let reasoning = generateReasoning(
      rsi,
      rsiSignal,
      macd,
      smas ?? {
        sma_20: currentPrice,
        sma_50: currentPrice,
        sma_200: currentPrice,
        price_vs_sma_20: "ABOVE",
        price_vs_sma_50: "ABOVE",
        price_vs_sma_200: "ABOVE",
        golden_cross: false,
        death_cross: false,
      },
      volume ?? { current: 0, avg_20: 0, ratio: 1, trend: "STABLE" },
      trend
    );
    
    // Add BTC-specific reasoning
    if (isBTC) {
      const btcReasons: string[] = [];
      
      // Halving cycle context
      if (halvingContext) {
        btcReasons.push(
          `Halving cycle: ${halvingContext.days_since_halving} days since halving, ${halvingContext.cycle_phase.replace(/_/g, " ").toLowerCase()}`
        );
      }
      
      // Funding rate insight
      if (fundingRate) {
        if (fundingRate.sentiment === "EXTREME_LONG" || fundingRate.sentiment === "EXTREME_SHORT") {
          btcReasons.push(`Funding ${fundingRate.sentiment.replace("_", " ").toLowerCase()}: ${fundingRate.interpretation}`);
        }
      }
      
      // Fear & Greed contrarian
      if (fearGreedExtended?.contrarian_signal) {
        btcReasons.push(fearGreedExtended.contrarian_signal);
      }
      
      // On-chain insights
      if (onChainMetrics.interpretation.length > 0) {
        btcReasons.push(onChainMetrics.interpretation[0]);
      }
      
      reasoning = [...reasoning, ...btcReasons];
    }

    // Calculate 24h and 7d changes
    let change24h = currentQuote?.regularMarketChangePercent ?? 0;
    let change7d = 0;
    if (closes.length >= 7) {
      const price7dAgo = closes[closes.length - 7];
      change7d = ((currentPrice - price7dAgo) / price7dAgo) * 100;
    }

    // Determine market trend based on fear & greed
    let marketTrend: "RISK_ON" | "RISK_OFF" | "NEUTRAL" = "NEUTRAL";
    if (fearGreed) {
      if (fearGreed.value > 60) marketTrend = "RISK_ON";
      else if (fearGreed.value < 40) marketTrend = "RISK_OFF";
    }

    // Build response
    const response = {
      success: true,
      data: {
        asset,
        name: config.name,
        timeframe,
        timestamp: new Date().toISOString(),

        price: {
          current: Math.round(currentPrice * 100) / 100,
          currency: "USD",
          change_24h: Math.round(change24h * 100) / 100,
          change_7d: Math.round(change7d * 100) / 100,
          volume_24h: currentQuote?.regularMarketVolume ?? volume?.current ?? 0,
          market_cap: currentQuote?.marketCap ?? 0,
        },

        signal: {
          action: signal.action,
          confidence: signal.confidence,
          strength: signal.strength,
          reasoning,
          ...(factorBreakdown && { factor_breakdown: factorBreakdown }),
        },

        targets,

        technicals: {
          trend,
          sma: smas ?? {
            sma_20: currentPrice,
            sma_50: currentPrice,
            sma_200: currentPrice,
            price_vs_sma_20: "ABOVE",
            price_vs_sma_50: "ABOVE",
            price_vs_sma_200: "ABOVE",
            golden_cross: false,
            death_cross: false,
          },
          rsi: {
            value: rsi,
            signal: rsiSignal,
            divergence: "NONE", // Simplified - divergence detection is complex
          },
          macd: {
            macd_line: macd.macd_line,
            signal_line: macd.signal_line,
            histogram: macd.histogram,
            crossover: macd.crossover,
          },
          bollinger: bollinger ?? {
            upper: currentPrice * 1.05,
            middle: currentPrice,
            lower: currentPrice * 0.95,
            position: "MIDDLE",
            squeeze: false,
          },
          volume: volume ?? {
            current: 0,
            avg_20: 0,
            ratio: 1,
            trend: "STABLE",
          },
          // Mayer Multiple (BTC only) - price / 200-day SMA
          // < 0.8 = undervalued, 0.8-1.0 = accumulation, 1.0-1.4 = fair, 1.4-2.4 = elevated, > 2.4 = overheated
          ...(mayerMultiple !== null && {
            mayer: {
              value: mayerMultiple,
              zone: mayerZone,
            },
          }),
        },

        context: {
          fear_greed_index: fearGreed?.value ?? 50,
          fear_greed_label: fearGreed?.label ?? "Neutral",
          btc_dominance: Math.round((btcDominance ?? 50) * 10) / 10,
          market_trend: marketTrend,
          // Enhanced Fear & Greed for BTC
          ...(fearGreedExtended && {
            fear_greed_trend_7d: fearGreedExtended.trend_7d,
            fear_greed_contrarian: fearGreedExtended.contrarian_signal,
          }),
        },

        // === BTC-SPECIFIC DEEP ANALYSIS ===
        ...(isBTC && {
          btc_analysis: {
            // Halving cycle context
            halving_cycle: halvingContext ? {
              days_since_halving: halvingContext.days_since_halving,
              halving_date: halvingContext.halving_date,
              current_block_reward: halvingContext.current_block_reward,
              next_halving_estimate: halvingContext.next_halving_estimate,
              cycle_phase: halvingContext.cycle_phase,
              cycle_bullish_bias: halvingContext.cycle_bullish_bias,
              historical_note: halvingContext.historical_note,
            } : null,

            // Perpetual futures funding rate
            funding_rate: fundingRate ? {
              rate: fundingRate.rate,
              rate_annualized_pct: fundingRate.rate_annualized,
              sentiment: fundingRate.sentiment,
              interpretation: fundingRate.interpretation,
            } : null,

            // On-chain metrics
            on_chain: {
              hash_rate_trend: onChainMetrics.hash_rate_trend,
              active_addresses_24h: onChainMetrics.active_addresses_24h,
              exchange_balance_trend: onChainMetrics.exchange_balance_trend,
              interpretation: onChainMetrics.interpretation,
            },
          },
        }),

      },

      meta: {
        request_id: requestId,
        processing_time_ms: Date.now() - startTime,
        cached: false,
        cache_ttl_seconds: CACHE_TTL[timeframe],
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request parameters",
            details: error.issues,
          },
          meta: { request_id: requestId },
        },
        { status: 400 }
      );
    }

    logger.error("api/acp/crypto-signal", "Error generating signal", { error: String(error) });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate signal",
        },
        meta: { request_id: requestId },
      },
      { status: 500 }
    );
  }
}

// GET returns documentation
export async function GET() {
  return NextResponse.json({
    name: "Crypto Trading Signal API",
    description: "AI-powered trading signals for BTC, ETH, SOL, HYPE with technical analysis",
    endpoint: "POST /api/acp/crypto-signal",
    supportedAssets: ["BTC", "ETH", "SOL", "HYPE"],
    supportedTimeframes: ["4h", "daily", "weekly"],
    requestSchema: {
      asset: "BTC | ETH | SOL | HYPE",
      timeframe: "4h | daily | weekly (default: daily)",
    },
    responseIncludes: [
      "signal (BUY/SELL/HOLD with confidence 0-100)",
      "price targets (support, resistance, stop loss, take profit)",
      "technicals (RSI, MACD, SMAs, Bollinger Bands, Volume)",
      "market context (Fear & Greed Index, BTC dominance)",
    ],
  });
}
