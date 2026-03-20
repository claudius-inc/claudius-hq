/**
 * Crypto Trading Signal API
 * Supports BTC, ETH, SOL, HYPE with technical analysis
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

const API_KEY = process.env.HQ_API_KEY;

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

// Fetch Fear & Greed Index
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

    // Fetch market context
    const [fearGreed, btcDominance] = await Promise.all([
      fetchFearGreedIndex(),
      fetchBTCDominance(),
    ]);

    // Calculate signal
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

    const signal = calculateSignal(signalFactors);

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
    const reasoning = generateReasoning(
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

    // Calculate Mayer Multiple for BTC (price / 200-day SMA)
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
        },

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
