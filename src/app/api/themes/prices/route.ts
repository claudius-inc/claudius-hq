import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { getCrowdingScores, aggregateCrowdingScores, CrowdingScore } from "@/lib/crowding";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface HistoricalRow {
  date: Date;
  close: number;
}

// Get historical prices for a ticker
async function getHistoricalPrices(
  ticker: string,
  period: "1w" | "1m" | "3m"
): Promise<{ start: number | null; end: number | null }> {
  try {
    const endDate = new Date();
    const startDate = new Date();

    if (period === "1w") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "1m") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate.setMonth(startDate.getMonth() - 3);
    }

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    const result = chartResult.quotes as HistoricalRow[];

    if (!result || result.length === 0) {
      return { start: null, end: null };
    }

    return {
      start: result[0]?.close ?? null,
      end: result[result.length - 1]?.close ?? null,
    };
  } catch {
    return { start: null, end: null };
  }
}

function calcPerformance(start: number | null, end: number | null): number | null {
  if (start === null || end === null || start === 0) return null;
  return ((end - start) / start) * 100;
}

// GET /api/themes/prices?tickers=AAPL,MSFT,GOOG
// Fetches prices for given tickers (max 20 at a time to prevent timeout)
export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get("tickers");
    if (!tickersParam) {
      return NextResponse.json({ error: "tickers param required" }, { status: 400 });
    }

    const tickers = tickersParam.split(",").slice(0, 20); // Max 20 tickers per request
    
    // Fetch crowding scores
    const crowdingMap = await getCrowdingScores(tickers);

    // Fetch all data in parallel for each ticker
    const results = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const [prices1w, prices1m, prices3m, quote] = await Promise.all([
            getHistoricalPrices(ticker, "1w"),
            getHistoricalPrices(ticker, "1m"),
            getHistoricalPrices(ticker, "3m"),
            (yahooFinance.quote(ticker) as Promise<{ regularMarketPrice?: number; shortName?: string }>).catch(() => null),
          ]);

          const quoteData = quote as { regularMarketPrice?: number; shortName?: string } | null;
          const crowding = crowdingMap.get(ticker);

          return {
            ticker,
            name: quoteData?.shortName ?? null,
            performance_1w: calcPerformance(prices1w.start, prices1w.end),
            performance_1m: calcPerformance(prices1m.start, prices1m.end),
            performance_3m: calcPerformance(prices3m.start, prices3m.end),
            current_price: quoteData?.regularMarketPrice ?? null,
            crowdingScore: crowding?.score,
            crowdingLevel: crowding?.level,
          };
        } catch {
          return {
            ticker,
            name: null,
            performance_1w: null,
            performance_1m: null,
            performance_3m: null,
            current_price: null,
          };
        }
      })
    );

    // Build map for easy lookup
    const priceMap: Record<string, typeof results[0]> = {};
    for (const r of results) {
      priceMap[r.ticker] = r;
    }

    // Calculate basket performance
    const validPerfs = {
      "1w": results.filter((r) => r.performance_1w !== null).map((r) => r.performance_1w!),
      "1m": results.filter((r) => r.performance_1m !== null).map((r) => r.performance_1m!),
      "3m": results.filter((r) => r.performance_3m !== null).map((r) => r.performance_3m!),
    };

    const basketPerformance = {
      performance_1w: validPerfs["1w"].length > 0 
        ? validPerfs["1w"].reduce((a, b) => a + b, 0) / validPerfs["1w"].length 
        : null,
      performance_1m: validPerfs["1m"].length > 0 
        ? validPerfs["1m"].reduce((a, b) => a + b, 0) / validPerfs["1m"].length 
        : null,
      performance_3m: validPerfs["3m"].length > 0 
        ? validPerfs["3m"].reduce((a, b) => a + b, 0) / validPerfs["3m"].length 
        : null,
    };

    // Find leaders
    const findLeader = (period: "performance_1w" | "performance_1m" | "performance_3m") => {
      const sorted = results
        .filter((r) => r[period] !== null)
        .sort((a, b) => (b[period] ?? 0) - (a[period] ?? 0));
      if (sorted.length === 0) return null;
      return { ticker: sorted[0].ticker, value: sorted[0][period]! };
    };

    // Aggregate crowding
    const crowdingScores = tickers
      .map((t) => crowdingMap.get(t))
      .filter((s): s is CrowdingScore => s !== undefined);
    const aggregatedCrowding = aggregateCrowdingScores(crowdingScores);

    return NextResponse.json(
      {
        prices: priceMap,
        basket: {
          ...basketPerformance,
          leaders: {
            "1w": findLeader("performance_1w"),
            "1m": findLeader("performance_1m"),
            "3m": findLeader("performance_3m"),
          },
          crowdingScore: aggregatedCrowding.score,
          crowdingLevel: aggregatedCrowding.level,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e) {
    logger.error("api/themes/prices", "Failed to get prices", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
