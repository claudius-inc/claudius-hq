import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import {
  normalizeTickerForMarket,
  normalizeMarketCode,
  detectMarketFromYahoo,
} from "@/lib/scanner/ticker-normalize";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface YahooQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  exchange?: string;
  fullExchangeName?: string;
  sector?: string;
  industry?: string;
  quoteType?: string;
  /** Yahoo's currency code, e.g. "USD", "GBp" (LSE pence). */
  currency?: string;
}

const MARKET_CANDIDATES = ["US", "SGX", "HK", "JP", "CN", "LSE"] as const;

// Reject anything Yahoo classifies outside of equities/ETFs. Skips synthetic
// artefacts like `ENSI.YHD` (mutualfund/index quoteType) which would otherwise
// answer `quote()` and shadow the real listing the user wants.
const ALLOWED_QUOTE_TYPES = new Set(["EQUITY", "ETF"]);

async function tryQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const result = (await yahooFinance.quote(symbol)) as YahooQuote | YahooQuote[];
    const q = Array.isArray(result) ? result[0] : result;
    if (!q || !q.symbol) return null;
    if (q.regularMarketPrice == null && !q.shortName && !q.longName) return null;
    if (q.quoteType && !ALLOWED_QUOTE_TYPES.has(q.quoteType.toUpperCase())) return null;
    return q;
  } catch {
    return null;
  }
}

// GET /api/tickers/lookup?ticker=NVDA&market=US
// If `market` is omitted, attempt detection across the common suffixes.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickerRaw = searchParams.get("ticker");
  const marketRaw = searchParams.get("market");

  if (!tickerRaw || tickerRaw.trim().length === 0) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const ticker = tickerRaw.trim();

  try {
    let normalized: string;
    let market: string;
    let quote: YahooQuote | null = null;

    if (marketRaw) {
      market = normalizeMarketCode(marketRaw);
      normalized = normalizeTickerForMarket(ticker, market);
      quote = await tryQuote(normalized);
    } else {
      let found: { normalized: string; market: string; quote: YahooQuote } | null = null;
      for (const m of MARKET_CANDIDATES) {
        const candidate = normalizeTickerForMarket(ticker, m);
        const q = await tryQuote(candidate);
        if (q) {
          const detected =
            detectMarketFromYahoo({
              exchange: q.exchange,
              fullExchangeName: q.fullExchangeName,
              symbol: q.symbol,
            }) ?? m;
          found = { normalized: candidate, market: detected, quote: q };
          break;
        }
      }
      if (!found) {
        return NextResponse.json(
          { error: `No quote found for "${ticker}"` },
          { status: 404 },
        );
      }
      normalized = found.normalized;
      market = found.market;
      quote = found.quote;
    }

    if (!quote) {
      return NextResponse.json(
        { error: `No quote found for "${normalized}"` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      normalized,
      market,
      name: quote.shortName || quote.longName || null,
      sector: quote.sector || quote.industry || null,
      exchange: quote.fullExchangeName || quote.exchange || null,
      price: quote.regularMarketPrice ?? null,
      quoteType: quote.quoteType || null,
      currency: quote.currency || null,
    });
  } catch (e) {
    logger.error("api/tickers/lookup", "Lookup failed", { error: e, ticker });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
