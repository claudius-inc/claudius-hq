import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import {
  detectMarketFromYahoo,
  normalizeMarketCode,
} from "@/lib/scanner/ticker-normalize";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Equities and ETFs only — drop options, indices, mutual funds, currencies,
// crypto, futures, and Yahoo's synthetic ".YHD"-style artefacts.
const ALLOWED_QUOTE_TYPES = new Set(["EQUITY", "ETF"]);

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  isYahooFinance?: boolean;
  score?: number;
  sector?: string;
  industry?: string;
}

interface YahooSearchResult {
  quotes?: YahooSearchQuote[];
}

interface SearchCandidate {
  symbol: string;
  name: string | null;
  exchange: string | null;
  market: string | null;
  quoteType: string | null;
  sector: string | null;
}

// GET /api/tickers/yahoo-search?q=ENSI&market=LSE&limit=6
// Wraps Yahoo's `search()` to return ranked equity/ETF candidates across
// exchanges. Used by the Add Ticker modal to disambiguate inputs like "ENSI"
// that resolve to multiple listings.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const marketRaw = searchParams.get("market");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw
    ? Math.min(20, Math.max(1, Number(limitRaw) || 6))
    : 6;

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const filterMarket = marketRaw ? normalizeMarketCode(marketRaw) : null;

  try {
    const result = (await yahooFinance.search(q, {
      quotesCount: 15,
      newsCount: 0,
    })) as YahooSearchResult;

    const quotes = Array.isArray(result?.quotes) ? result.quotes : [];

    const candidates: SearchCandidate[] = quotes
      .filter((qq) => qq.isYahooFinance !== false)
      .filter((qq): qq is YahooSearchQuote & { symbol: string } => !!qq.symbol)
      .filter(
        (qq) =>
          !!qq.quoteType && ALLOWED_QUOTE_TYPES.has(qq.quoteType.toUpperCase()),
      )
      .map((qq) => ({
        symbol: qq.symbol,
        name: qq.shortname || qq.longname || null,
        exchange: qq.exchDisp || qq.exchange || null,
        market: detectMarketFromYahoo({
          exchange: qq.exchange,
          fullExchangeName: qq.exchDisp,
          symbol: qq.symbol,
        }),
        quoteType: qq.quoteType ?? null,
        sector: qq.sector || qq.industry || null,
      }))
      .filter((c) => (filterMarket ? c.market === filterMarket : true))
      .slice(0, limit);

    return NextResponse.json({ candidates });
  } catch (e) {
    logger.error("api/tickers/yahoo-search", "Search failed", { error: e, q });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
