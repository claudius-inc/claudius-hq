import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Public ACP V2 Resource — multi-source live price feed.
// Cheap, polled-friendly oracle. CoinGecko-first for crypto, Yahoo Finance
// fallback for everything else (stocks, commodities, forex).

interface PriceResponse {
  symbol: string;
  priceUsd: number;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  source: "coingecko" | "yahoo";
  timestamp: string;
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  HYPE: "hyperliquid",
  VIRTUAL: "virtual-protocol",
  AIXBT: "aixbt",
  PEPE: "pepe",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  BONK: "bonk",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  ARB: "arbitrum",
  OP: "optimism",
  AVAX: "avalanche-2",
  ATOM: "cosmos",
  DOT: "polkadot",
  ADA: "cardano",
  XRP: "ripple",
};

async function fromCoinGecko(symbol: string): Promise<PriceResponse | null> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      market_data?: {
        current_price?: { usd?: number };
        price_change_percentage_24h?: number;
        price_change_percentage_7d?: number;
        market_cap?: { usd?: number };
        total_volume?: { usd?: number };
      };
    };
    const md = j.market_data;
    if (!md?.current_price?.usd) return null;
    return {
      symbol,
      priceUsd: md.current_price.usd,
      change24h: md.price_change_percentage_24h ?? null,
      change7d: md.price_change_percentage_7d ?? null,
      marketCap: md.market_cap?.usd ?? null,
      volume24h: md.total_volume?.usd ?? null,
      source: "coingecko",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn("resources/live-price", `CoinGecko fetch failed for ${symbol}: ${err}`);
    return null;
  }
}

async function fromYahoo(symbol: string): Promise<PriceResponse | null> {
  try {
    // Map common alt symbols to Yahoo tickers.
    const yahooSymbol =
      symbol === "XAU" || symbol === "GOLD" ? "GC=F" :
      symbol === "XAG" || symbol === "SILVER" ? "SI=F" :
      symbol === "OIL" || symbol === "WTI" ? "CL=F" :
      symbol === "BRENT" ? "BZ=F" :
      symbol;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=7d&interval=1d`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; marketCap?: number }; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
    };
    const r = j.chart?.result?.[0];
    const price = r?.meta?.regularMarketPrice;
    if (typeof price !== "number") return null;
    const closes = r?.indicators?.quote?.[0]?.close ?? [];
    const last = price;
    const yesterday = closes.length >= 2 ? closes[closes.length - 2] : null;
    const weekAgo = closes.length > 0 ? closes[0] : null;
    const change24h = yesterday ? ((last - yesterday) / yesterday) * 100 : null;
    const change7d = weekAgo ? ((last - weekAgo) / weekAgo) * 100 : null;
    return {
      symbol,
      priceUsd: last,
      change24h,
      change7d,
      marketCap: r?.meta?.marketCap ?? null,
      volume24h: null,
      source: "yahoo",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn("resources/live-price", `Yahoo fetch failed for ${symbol}: ${err}`);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required param: symbol", example: "?symbol=BTC" },
      { status: 400 }
    );
  }

  // Try CoinGecko first (richer crypto data), Yahoo fallback for non-crypto.
  let result = await fromCoinGecko(symbol);
  if (!result) result = await fromYahoo(symbol);

  if (!result) {
    return NextResponse.json(
      { error: `Could not resolve price for symbol: ${symbol}`, hint: "Try BTC, ETH, SOL, AAPL, NVDA, GC=F, etc." },
      { status: 404 }
    );
  }

  return NextResponse.json(result, {
    headers: { "cache-control": "public, max-age=30, s-maxage=30" },
  });
}
