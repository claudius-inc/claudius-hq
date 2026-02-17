import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tradeJournal } from "@/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

// GET /api/trade-journal — List entries or stats
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker");
    const outcome = url.searchParams.get("outcome");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const stats = url.searchParams.get("stats");

    if (stats === "true") {
      const all = await db.select().from(tradeJournal);
      const closed = all.filter((t) => t.outcome !== "open");
      const wins = closed.filter((t) => t.outcome === "win").length;
      const losses = closed.filter((t) => t.outcome === "loss").length;
      const breakeven = closed.filter((t) => t.outcome === "breakeven").length;

      // Calculate avg return for closed trades with exit price
      const withExit = closed.filter((t) => t.exitPrice != null);
      const returns = withExit.map((t) => ((t.exitPrice! - t.price) / t.price) * 100);
      const avgReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

      // Best/worst
      const best = returns.length ? Math.max(...returns) : 0;
      const worst = returns.length ? Math.min(...returns) : 0;

      // Avg holding period (days)
      const holdingDays = withExit
        .filter((t) => t.exitDate)
        .map((t) => {
          const d1 = new Date(t.date);
          const d2 = new Date(t.exitDate!);
          return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
        });
      const avgHoldingDays = holdingDays.length
        ? Math.round(holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length)
        : 0;

      return NextResponse.json({
        total: all.length,
        open: all.length - closed.length,
        closed: closed.length,
        wins,
        losses,
        breakeven,
        winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
        avgReturn: Math.round(avgReturn * 100) / 100,
        bestReturn: Math.round(best * 100) / 100,
        worstReturn: Math.round(worst * 100) / 100,
        avgHoldingDays,
      });
    }

    const conditions = [];
    if (ticker) conditions.push(eq(tradeJournal.ticker, ticker.toUpperCase()));
    if (outcome) conditions.push(eq(tradeJournal.outcome, outcome));
    if (from) conditions.push(gte(tradeJournal.date, from));
    if (to) conditions.push(lte(tradeJournal.date, to));

    const entries = await db
      .select()
      .from(tradeJournal)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(tradeJournal.date));

    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/trade-journal — Create new entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, action, price, shares, date, thesis, catalysts, invalidators, emotionalState, tags } = body;

    if (!ticker || !action || !price || !date || !thesis) {
      return NextResponse.json(
        { error: "ticker, action, price, date, and thesis are required" },
        { status: 400 }
      );
    }

    const [entry] = await db
      .insert(tradeJournal)
      .values({
        ticker: ticker.toUpperCase().trim(),
        action,
        price,
        shares: shares || null,
        date,
        thesis,
        catalysts: catalysts || null,
        invalidators: invalidators || null,
        emotionalState: emotionalState || null,
        tags: tags ? JSON.stringify(tags) : "[]",
      })
      .returning();

    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
