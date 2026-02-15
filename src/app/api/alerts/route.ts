import { NextRequest, NextResponse } from "next/server";
import { db, stockAlerts } from "@/db";
import { desc, eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
}

// GET /api/alerts — List all alerts with current prices
export async function GET() {
  try {
    const alerts = await db
      .select()
      .from(stockAlerts)
      .orderBy(desc(stockAlerts.createdAt));

    // Fetch current prices for all tickers
    const alertsWithPrices = await Promise.all(
      alerts.map(async (alert) => {
        try {
          const quote = (await yahooFinance.quote(alert.ticker)) as QuoteResult;
          return {
            ...alert,
            currentPrice: quote?.regularMarketPrice ?? null,
            dayChange: quote?.regularMarketChangePercent ?? null,
            companyName: quote?.shortName ?? null,
          };
        } catch {
          return {
            ...alert,
            currentPrice: null,
            dayChange: null,
            companyName: null,
          };
        }
      })
    );

    return NextResponse.json({ alerts: alertsWithPrices });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/alerts — Create new alert
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ticker,
      accumulate_low,
      accumulate_high,
      strong_buy_low,
      strong_buy_high,
      notes,
    } = body;

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase().trim();

    // Validate the ticker exists
    try {
      await yahooFinance.quote(upperTicker);
    } catch {
      return NextResponse.json(
        { error: `Invalid ticker: ${upperTicker}` },
        { status: 400 }
      );
    }

    // Check if alert already exists for this ticker
    const existing = await db
      .select({ id: stockAlerts.id })
      .from(stockAlerts)
      .where(eq(stockAlerts.ticker, upperTicker));

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Alert for ${upperTicker} already exists` },
        { status: 409 }
      );
    }

    const [newAlert] = await db
      .insert(stockAlerts)
      .values({
        ticker: upperTicker,
        accumulateLow: accumulate_low ?? null,
        accumulateHigh: accumulate_high ?? null,
        strongBuyLow: strong_buy_low ?? null,
        strongBuyHigh: strong_buy_high ?? null,
        notes: notes ?? null,
        status: "watching",
      })
      .returning();

    return NextResponse.json({ alert: newAlert }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
